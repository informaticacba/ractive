import type { SetOpts } from 'types/MethodOptions';
import { isNumber, isObjectType } from 'utils/is';

import type { Ractive } from '../RactiveDefinition';

import add from './shared/add';

export default function Ractive$subtract(
  this: Ractive,
  keypath: string,
  d: number,
  options: SetOpts
): Promise<void> {
  const num = isNumber(d) ? -d : -1;
  const opts = isObjectType<SetOpts>(d) ? d : options;
  return add(this, keypath, num, opts);
}
