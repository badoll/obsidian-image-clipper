export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function renderNativeHostWrapper({ nodePath, scriptPath }) {
  if (!nodePath) throw new Error("Missing nodePath for native host wrapper");
  if (!scriptPath) throw new Error("Missing scriptPath for native host wrapper");

  return `#!/bin/sh
exec ${shellQuote(nodePath)} ${shellQuote(scriptPath)} "$@"
`;
}
