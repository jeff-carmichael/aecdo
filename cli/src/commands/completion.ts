import { basename } from "node:path";

export const SHELLS = ["bash", "zsh", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

const COMMANDS: [name: string, description: string][] = [
  ["validate", "Validate a JSON-LD file against the AECDO schema"],
  ["summary", "Print a concise summary of a drawing set"],
  ["sheets", "List all sheets"],
  ["page", "Print one sheet by sheet number or page index"],
  ["explore", "Browse a drawing set interactively"],
  ["configure", "Set up API credentials and region (configure ai: AI assistant)"],
  ["process", "Upload a PDF, wait, and save the result"],
  ["upload", "Upload a PDF and return the job ID"],
  ["status", "Check the status of a processing job"],
  ["download", "Download the result of a completed job"],
  ["update", "Update aecdo to the latest release"],
  ["examples", "Download the example drawing sets into a folder"],
  ["completion", "Print a shell completion script"],
];

const PDF_COMMANDS = ["process", "upload"];
const JSONLD_COMMANDS = ["validate", "summary", "sheets", "page", "explore"];
const JOB_COMMANDS = ["status", "download"];

const OPTIONS = [
  "--help",
  "--version",
  "--schema",
  "--format",
  "--pretty",
  "--output",
  "--poll",
  "--wait",
  "--then",
  "--stdout",
  "--pdf",
  "--force",
  "--no-update-check",
];

export function detectShell(shellEnv: string | undefined): Shell | undefined {
  if (!shellEnv) return undefined;
  const name = basename(shellEnv).replace(/\.exe$/i, "");
  return (SHELLS as readonly string[]).includes(name) ? (name as Shell) : undefined;
}

function bashScript(): string {
  return `# aecdo bash completion
# Install: add this line to ~/.bashrc
#   eval "$(aecdo completion bash)"
_aecdo_files() {
  local cur="$1" mode="$2" f
  compopt -o filenames 2>/dev/null
  while IFS= read -r f; do
    if [[ -d "$f" ]]; then
      COMPREPLY+=("$f")
    elif [[ "$mode" == pdf ]]; then
      case "$f" in *.[pP][dD][fF]) COMPREPLY+=("$f") ;; esac
    else
      case "$f" in *.[jJ][sS][oO][nN]|*.[jJ][sS][oO][nN][lL][dD]) COMPREPLY+=("$f") ;; esac
    fi
  done < <(compgen -f -- "$cur")
}

_aecdo() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}" cmd="\${COMP_WORDS[1]}"
  COMPREPLY=()

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${COMMANDS.map(([n]) => n).join(" ")} --help --version" -- "$cur"))
    return
  fi

  case "$prev" in
    --format) COMPREPLY=($(compgen -W "json text" -- "$cur")); return ;;
    --then) COMPREPLY=($(compgen -W "validate summary explore" -- "$cur")); return ;;
    -o|--output|--schema|--pdf) compopt -o filenames 2>/dev/null; COMPREPLY=($(compgen -f -- "$cur")); return ;;
    --poll) return ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "${OPTIONS.join(" ")}" -- "$cur"))
    return
  fi

  case "$cmd" in
    ${PDF_COMMANDS.join("|")}) _aecdo_files "$cur" pdf ;;
    ${JSONLD_COMMANDS.join("|")}) _aecdo_files "$cur" jsonld ;;
    completion) COMPREPLY=($(compgen -W "${SHELLS.join(" ")}" -- "$cur")) ;;
    examples) compopt -o filenames 2>/dev/null; COMPREPLY=($(compgen -d -- "$cur")) ;;
    configure) [[ $COMP_CWORD -eq 2 ]] && COMPREPLY=($(compgen -W "ai" -- "$cur")) ;;
  esac
}

complete -F _aecdo aecdo
`;
}

function zshEscape(s: string): string {
  return s.replace(/'/g, "'\\''").replace(/:/g, "\\:");
}

function zshScript(): string {
  const commands = COMMANDS.map(([n, d]) => `    '${n}:${zshEscape(d)}'`).join("\n");
  return `#compdef aecdo
# aecdo zsh completion
# Install: add this line to ~/.zshrc (after compinit, if you call it yourself)
#   eval "$(aecdo completion zsh)"
_aecdo() {
  local curcontext="$curcontext" state line
  local -a commands opts
  commands=(
${commands}
  )
  opts=(
    '--format[Output format]:format:(json text)'
    '--pretty[Pretty-print JSON output]'
    '(-o --output)'{-o,--output}'[Write output to a file]:file:_files'
    '--schema[Use a custom schema file]:schema file:_files'
    '--poll[Polling interval in seconds]:seconds:'
    '--wait[Wait for job completion]'
    '--then[Pipe the result into a command]:command:(validate summary explore)'
    '--stdout[Print the result instead of saving it]'
    '--pdf[Source PDF for view in explore]:pdf file:_files -g "*.(pdf|PDF)"'
    '--force[Replace example files that are already there]'
    '--no-update-check[Skip the daily update check]'
  )

  _arguments -C '1:command:->command' '*::arg:->args'

  case $state in
    command)
      _describe -t commands 'aecdo command' commands
      ;;
    args)
      case $line[1] in
        ${PDF_COMMANDS.join("|")})
          _arguments $opts '1:PDF file:_files -g "*.(#i)pdf(-.)"'
          ;;
        page)
          _arguments $opts '1:JSON-LD file:_files -g "*.(#i)(jsonld|json)(-.)"' '2:sheet number or page index:'
          ;;
        ${JSONLD_COMMANDS.filter((c) => c !== "page").join("|")})
          _arguments $opts '1:JSON-LD file:_files -g "*.(#i)(jsonld|json)(-.)"'
          ;;
        ${JOB_COMMANDS.join("|")})
          _arguments $opts '1:job ID:'
          ;;
        examples)
          _arguments $opts '1:folder:_files -/'
          ;;
        completion)
          _arguments '1:shell:(${SHELLS.join(" ")})'
          ;;
        configure)
          _arguments '1:what:((ai\\:"AI assistant sign-in and API keys"))'
          ;;
      esac
      ;;
  esac
}

if [[ "$funcstack[1]" == _aecdo ]]; then
  _aecdo "$@"
else
  (( $+functions[compdef] )) || { autoload -Uz compinit && compinit }
  compdef _aecdo aecdo
fi
`;
}

function fishEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function fishScript(): string {
  const cmdNames = COMMANDS.map(([n]) => n).join(" ");
  const lines = [
    "# aecdo fish completion",
    "# Install:",
    "#   aecdo completion fish > ~/.config/fish/completions/aecdo.fish",
    "complete -c aecdo -f",
    "function __aecdo_complete_files",
    "    __fish_complete_path (commandline -ct) | string match -rie -- \"(?:/|\\.(?:$argv[1]))(?:\\t.*)?\\$\"",
    "end",
    ...COMMANDS.map(([n, d]) => `complete -c aecdo -n 'not __fish_seen_subcommand_from ${cmdNames}' -a ${n} -d '${fishEscape(d)}'`),
    `complete -c aecdo -n '__fish_seen_subcommand_from ${PDF_COMMANDS.join(" ")}' -a '(__aecdo_complete_files pdf)'`,
    `complete -c aecdo -n '__fish_seen_subcommand_from ${JSONLD_COMMANDS.join(" ")}' -a '(__aecdo_complete_files "jsonld|json")'`,
    `complete -c aecdo -n '__fish_seen_subcommand_from completion' -a '${SHELLS.join(" ")}'`,
    "complete -c aecdo -n '__fish_seen_subcommand_from configure' -a ai -d 'AI assistant sign-in and API keys'",
    "complete -c aecdo -s h -l help -d 'Show help'",
    "complete -c aecdo -s v -l version -d 'Show version number'",
    "complete -c aecdo -l format -x -a 'json text' -d 'Output format'",
    "complete -c aecdo -l pretty -d 'Pretty-print JSON output'",
    "complete -c aecdo -s o -l output -r -F -d 'Write output to a file'",
    "complete -c aecdo -l schema -r -F -d 'Use a custom schema file'",
    "complete -c aecdo -l poll -x -d 'Polling interval in seconds'",
    "complete -c aecdo -l wait -d 'Wait for job completion'",
    "complete -c aecdo -l then -x -a 'validate summary explore' -d 'Pipe the result into a command'",
    "complete -c aecdo -l stdout -d 'Print the result instead of saving it'",
    "complete -c aecdo -l pdf -r -F -d 'Source PDF for view in explore'",
    "complete -c aecdo -l force -d 'Replace example files that are already there'",
    "complete -c aecdo -l no-update-check -d 'Skip the daily update check'",
  ];
  return lines.join("\n") + "\n";
}

export function completionScript(shell: Shell): string {
  switch (shell) {
    case "bash":
      return bashScript();
    case "zsh":
      return zshScript();
    case "fish":
      return fishScript();
  }
}

export function completion(shellArg: string | undefined, shellEnv = process.env.SHELL): void {
  const shell = shellArg ?? detectShell(shellEnv);
  if (!shell) {
    throw new Error(`Could not detect your shell. Run "aecdo completion <${SHELLS.join("|")}>".`);
  }
  if (!(SHELLS as readonly string[]).includes(shell)) {
    throw new Error(`Unsupported shell "${shell}". Use one of: ${SHELLS.join(", ")}.`);
  }
  process.stdout.write(completionScript(shell as Shell));
}
