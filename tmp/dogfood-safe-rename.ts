import { createCodeAnalyzer } from '../src/core/index';
import { MCPAdapter } from '../src/adapters/mcp-adapter';

async function main() {
  const analyzer = await createCodeAnalyzer({ workspaceRoot: process.cwd() });
  await analyzer.initialize();
  const mcp = new MCPAdapter(analyzer as any, {});
  const res = await mcp.handleToolCall('workflow_safe_rename', {
    oldName: 'HTTPServer',
    newName: 'HTTPServerX',
    file: 'src/servers/http.ts',
    runChecks: true,
    commands: ['bun run build:all', 'bun test -q'],
    timeoutSec: 180
  });
  const text = res?.content?.[0]?.text || '';
  try {
    const obj = JSON.parse(String(text));
    const files = obj.filesAffected ?? obj.summary?.filesAffected ?? 0;
    const edits = obj.totalEdits ?? obj.summary?.totalEdits ?? 0;
    const snap = obj.snapshot || '(none)';
    const ok = obj.ok !== false;
    console.log(`Safe rename plan applied to snapshot ${snap}`);
    console.log(`Files affected: ${files}, total edits: ${edits}`);
    if (obj.next_actions) console.log(`Next: ${obj.next_actions.join(' | ')}`);
    console.log(`Checks: ${ok ? 'OK' : 'FAIL'}`);
  } catch {
    console.log(text);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
