export function to_csv(rows: Record<string, string | number | null>[], columns: { key: string; label: string }[]) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

export function download_csv(filename: string, content: string) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
