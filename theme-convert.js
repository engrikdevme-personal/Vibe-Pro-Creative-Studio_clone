import fs from 'fs';
let app = fs.readFileSync('src/App.tsx', 'utf-8');

app = app.replaceAll('bg-[#0b0f19]', 'bg-[var(--bg-app)]');
app = app.replaceAll('bg-[#111827]', 'bg-[var(--bg-panel)]');
app = app.replaceAll('bg-[#0f1423]', 'bg-[var(--bg-subpanel)]');
app = app.replaceAll('bg-[#0f172a]', 'bg-[var(--bg-subpanel)]'); // for code blocks

app = app.replaceAll('bg-slate-900', 'bg-[var(--bg-app)]');
app = app.replaceAll('bg-slate-800', 'bg-[var(--btn-bg)]');
app = app.replaceAll('hover:bg-slate-800', 'hover:bg-[var(--btn-hover)]');
app = app.replaceAll('hover:bg-slate-700', 'hover:bg-[var(--btn-hover)]');
app = app.replaceAll('bg-slate-700', 'bg-[var(--btn-hover)]');

// Borders
app = app.replaceAll('border-slate-800', 'border-[var(--border-subtle)]');
app = app.replaceAll('border-slate-700', 'border-[var(--border-focus)]');
app = app.replaceAll('border-slate-600', 'border-[var(--border-focus)]');

// Texts
app = app.replaceAll('text-slate-200', 'text-[var(--text-primary)]');
app = app.replaceAll('text-slate-100', 'text-[var(--text-primary)]');
app = app.replaceAll('text-white', 'text-[var(--text-primary)]');
app = app.replaceAll('text-slate-300', 'text-[var(--text-secondary)]');
app = app.replaceAll('text-slate-400', 'text-[var(--text-tertiary)]');
app = app.replaceAll('text-slate-500', 'text-[var(--text-tertiary)]');
app = app.replaceAll('text-slate-700', 'text-[var(--text-secondary)]'); // mostly for icons or placeholder
app = app.replaceAll('hover:text-white', 'hover:text-[var(--text-primary)]');
app = app.replaceAll('hover:text-slate-300', 'hover:text-[var(--text-secondary)]');

app = app.replaceAll('bg-slate-800/50', 'bg-[var(--btn-bg)]/50');
app = app.replaceAll('border-slate-700/50', 'border-[var(--border-focus)]/50');

fs.writeFileSync('src/App.tsx', app);
console.log('Done mapping themes.');
