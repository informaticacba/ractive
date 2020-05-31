import './polyfills/Object.assign';
import './polyfills/array.find';
import './polyfills/node.contains';
import './polyfills/performance.now';
import './polyfills/Promise';
import './polyfills/requestAnimationFrame';

import { warn } from 'utils/log';
import { assign, defineProperty, defineProperties } from 'utils/object';

import { svg, win } from './config/environment';
import { extend, extendWith } from './extend/_extend';
import macro from './extend/_macro';
import { getCSS, splitTag } from './global/css';
import { batch } from './global/runloop';
import CSSModel from './model/specials/CSSModel';
import { data as sharedData } from './model/specials/SharedModel';
import parse from './parse/_parse';
import defaults from './Ractive/config/defaults';
import construct from './Ractive/construct';
import initialise from './Ractive/initialise';
import proto from './Ractive/prototype';
import shared from './Ractive/shared';
import easing from './Ractive/static/easing';
import { findPlugin } from './Ractive/static/findPlugin';
import getContext from './Ractive/static/getContext';
import interpolators from './Ractive/static/interpolators';
import isInstance from './Ractive/static/isInstance';
import { joinKeys, splitKeypath } from './Ractive/static/keypaths';
import use from './Ractive/static/use';
import { extern } from './shared/getRactiveContext';
import { escapeKey, unescapeKey, normalise } from './shared/keypaths';
import parseJSON from './utils/parseJSON';

export default function Ractive(options) {
  if (!(this instanceof Ractive)) return new Ractive(options);

  construct(this, options || {});
  initialise(this, options || {}, {});
}

// check to see if we're being asked to force Ractive as a global for some weird environments
if (win && !win.Ractive) {
  let opts = '';
  const script =
    document.currentScript ||
    /* istanbul ignore next */ document.querySelector('script[data-ractive-options]');

  if (script) opts = script.getAttribute('data-ractive-options') || '';

  /* istanbul ignore next */
  if (~opts.indexOf('ForceGlobal')) win.Ractive = Ractive;
} else if (win) {
  warn(`Ractive already appears to be loaded while loading BUILD_PLACEHOLDER_VERSION.`);
}

assign(Ractive.prototype, proto, defaults);
Ractive.prototype.constructor = Ractive;

// alias prototype as `defaults`
Ractive.defaults = Ractive.prototype;

// share defaults with the parser
shared.defaults = Ractive.defaults;
shared.Ractive = Ractive;

// static properties
defineProperties(Ractive, {
  // debug flag
  DEBUG: { writable: true, value: true },
  DEBUG_PROMISES: { writable: true, value: true },

  // static methods:
  extend: { value: extend },
  extendWith: { value: extendWith },
  escapeKey: { value: escapeKey },
  evalObjectString: { value: parseJSON },
  findPlugin: { value: findPlugin },
  getContext: { value: getContext },
  getCSS: { value: getCSS },
  isInstance: { value: isInstance },
  joinKeys: { value: joinKeys },
  macro: { value: macro },
  normaliseKeypath: { value: normalise },
  parse: { value: parse },
  splitKeypath: { value: splitKeypath },
  // sharedSet and styleSet are in _extend because circular refs
  unescapeKey: { value: unescapeKey },
  use: { value: use },

  // support
  enhance: { writable: true, value: false },
  svg: { value: svg },
  tick: {
    get() {
      return batch && batch.promise;
    }
  },

  // version
  VERSION: { value: 'BUILD_PLACEHOLDER_VERSION' },

  // plugins
  adaptors: { writable: true, value: {} },
  components: { writable: true, value: {} },
  decorators: { writable: true, value: {} },
  easing: { writable: true, value: easing },
  events: { writable: true, value: {} },
  extensions: { value: [] },
  helpers: { writable: true, value: defaults.helpers },
  interpolators: { writable: true, value: interpolators },
  partials: { writable: true, value: {} },
  transitions: { writable: true, value: {} },

  // CSS variables
  cssData: { configurable: true, value: {} },
  perComponentStyleElements: { get: splitTag, set: splitTag },

  // access to @shared without an instance
  sharedData: { value: sharedData },

  // for getting the source Ractive lib from a constructor
  Ractive: { value: Ractive },

  // to allow extending contexts
  Context: { value: extern.Context.prototype }
});

// cssData must already be in place
defineProperty(Ractive, '_cssModel', {
  configurable: true,
  value: new CSSModel(Ractive)
});

defineProperty(Ractive.prototype, 'rendered', {
  get() {
    return this.fragment && this.fragment.rendered;
  }
});
