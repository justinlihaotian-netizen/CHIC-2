/** "Ava - Shellac Mani (group of Jane Doe)" → client "Ava", service "Shellac Mani", groupOf "Jane Doe" */
export function parseTitle(title: string) {
  let rest = title.trim();
  let groupOf: string | null = null;
  const group = rest.match(/\(\s*group of\s+([^)]+?)\s*\)/i);
  if (group) {
    groupOf = group[1];
    rest = rest.replace(group[0], "").trim();
  }
  const dash = rest.indexOf(" - ");
  if (dash === -1) return { clientName: rest || "(no name)", service: "", groupOf };
  return {
    clientName: rest.slice(0, dash).trim() || "(no name)",
    service: rest.slice(dash + 3).trim(),
    groupOf,
  };
}

/** The reverse: ("Ava", "Shellac Mani", "Jane Doe") → "Ava - Shellac Mani (group of Jane Doe)" */
export function buildTitle(clientName: string, service: string, groupOf: string | null) {
  let title = service ? `${clientName} - ${service}` : clientName;
  if (groupOf) title += ` (group of ${groupOf})`;
  return title;
}
