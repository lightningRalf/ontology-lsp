import { CoreError, isCoreError } from '../core/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export function toMcpError(err: unknown): McpError {
  if (isCoreError(err)) {
    switch (err.code) {
      case 'UnknownTool':
        return new McpError(ErrorCode.MethodNotFound, err.message, { data: err.data });
      case 'InvalidParams':
        return new McpError(ErrorCode.InvalidParams, err.message, { data: err.data });
      default:
        return new McpError(ErrorCode.InternalError, err.message, { data: err.data });
    }
  }
  if (err instanceof McpError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new McpError(ErrorCode.InternalError, msg);
}

