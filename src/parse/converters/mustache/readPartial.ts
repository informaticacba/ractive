import TemplateItemType from 'config/types';
import { StandardParser } from 'parse/_parse';
import { refineExpression } from 'parse/utils/refineExpression';

import readExpression from '../readExpression';

import {
  ParserTag,
  PartialMustacheTemplateItem,
  AliasDefinitionRefinedTemplateItem
} from './mustacheDefinitions';
import { readAliases } from './readAliases';

export default function readPartial(
  parser: StandardParser,
  tag: ParserTag
): PartialMustacheTemplateItem {
  const type = parser.matchString('>') || parser.matchString('yield');
  const partial: PartialMustacheTemplateItem = {
    t: type === '>' ? TemplateItemType.PARTIAL : TemplateItemType.YIELDER
  };
  let aliases: AliasDefinitionRefinedTemplateItem[] | string;

  if (!type) return null;

  parser.sp();

  if (type === '>' || !(aliases = parser.matchString('with'))) {
    // Partial names can include hyphens, so we can't use readExpression
    // blindly. Instead, we use the `relaxedNames`.
    parser.relaxedNames = parser.strictRefinement = true;
    const expression = readExpression(parser);
    parser.relaxedNames = parser.strictRefinement = false;

    if (!expression && type === '>') return null;

    if (expression) {
      refineExpression(expression, partial); // TODO...
      parser.sp();
      if (type !== '>') aliases = parser.matchString('with');
    }
  }

  parser.sp();

  // check for alias context e.g. `{{>foo bar as bat, bip as bop}}`
  if (aliases || type === '>') {
    aliases = readAliases(parser);
    if (aliases && aliases.length) {
      partial.z = aliases;
    } else {
      // otherwise check for literal context e.g. `{{>foo bar}}` then
      // turn it into `{{#with bar}}{{>foo}}{{/with}}`
      const context = readExpression(parser);
      if (context) {
        partial.c = {};
        refineExpression(context, partial.c);
      }

      // allow aliases after context
      if (parser.matchString(',')) {
        aliases = readAliases(parser);
        if (aliases && aliases.length) {
          partial.z = aliases;
        }
      }
    }

    if (type !== '>' && !partial.c && !partial.z) {
      // {{yield with}} requires some aliases
      parser.error(`Expected a context or one or more aliases`);
    }
  }

  parser.sp();

  if (!parser.matchString(tag.close)) {
    parser.error(`Expected closing delimiter '${tag.close}'`);
  }

  return partial;
}
