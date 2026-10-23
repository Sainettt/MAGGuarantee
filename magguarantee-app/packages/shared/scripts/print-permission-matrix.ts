// Prints the docs/03 permission matrix (docs/25 B1) to stdout:
//   npm run -s authz:matrix -w @magguarantee/shared
// Paste the output between `<!-- authz:matrix:start -->` and
// `<!-- authz:matrix:end -->` in docs/03-roles.md; `tests/permissions.test.ts`
// fails until the two agree.

import { renderPermissionMatrix } from '../src/permissions-matrix';

process.stdout.write(`${renderPermissionMatrix()}\n`);
