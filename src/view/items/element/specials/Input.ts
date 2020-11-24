import { isFunction } from 'utils/is';

import Element from '../../Element';
import type { BindingFlagOwner } from '../BindingFlag';
import type { ConditionalAttributeOwner } from '../ConditionalAttribute';

export default class Input extends Element implements BindingFlagOwner, ConditionalAttributeOwner {
  public checked: boolean;

  /** @override */
  public node: HTMLInputElement;

  render(target: HTMLElement, occupants: HTMLElement[]): void {
    super.render(target, occupants);
    this.node.defaultValue = this.node.value;
  }

  compare(value: unknown, attrValue: unknown): boolean {
    const comparator = this.getAttribute('value-comparator');
    if (comparator) {
      if (isFunction(comparator)) {
        return comparator(value, attrValue);
      }
      if (value && attrValue) {
        return value[comparator] == attrValue[comparator];
      }
    }
    return value == attrValue;
  }
}
