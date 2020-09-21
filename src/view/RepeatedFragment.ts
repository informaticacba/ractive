import { ELEMENT } from 'config/types';
import Model from 'model/Model';
import KeyModel from 'model/specials/KeyModel';
import { getContext } from 'shared/getRactiveContext';
import { toEscapedString, toString, shuffled, update } from 'shared/methodCallers';
import { Ractive } from 'src/Ractive/RactiveDefinition';
import { findMap, buildNewIndices } from 'utils/array';
import { createDocumentFragment } from 'utils/dom';
import { isArray, isObject, isObjectType, isUndefined } from 'utils/is';
import { keys } from 'utils/object';

import { splitKeypath } from '../shared/keypaths';

import Fragment, { getKeypath, FragmentOpts } from './Fragment';
import Element from './items/Element';
import resolve from './resolvers/resolve';

const keypathString = /^"(\\"|[^"])+"$/;

export interface RepeatedFragmentOpts extends FragmentOpts {
  indexRef?: RepeatedFragment['indexRef'];
  keyRef?: RepeatedFragment['keyRef'];
}

export default class RepeatedFragment {
  private owner: any;
  public parent: any;
  public ractive: Ractive;
  public template: any;

  // boolean | number | Element
  private delegate: any;

  public context: Model;
  private iterations: Fragment[];
  private indexRef: string;
  public keyRef: string;
  private pendingNewIndices: any[];
  private previousIterations: any;
  public aliases: any;
  private shuffler: any;
  public source: any;
  private values: any;
  private length: number;
  private bubbled: number[];
  private rebounding: number;

  private lastModel: KeyModel;
  private pathModel: KeyModel;
  private rootModel: KeyModel;

  private rendered: boolean;
  private isArray: boolean;
  private updating: boolean;

  public bound: boolean;
  public up: RepeatedFragment;
  public cssIds: string[];

  constructor(options: RepeatedFragmentOpts) {
    this.parent = options.owner.up;

    // bit of a hack, so reference resolution works without another
    // layer of indirection
    this.up = this;
    this.owner = options.owner;
    this.ractive = this.parent.ractive;
    this.delegate =
      this.ractive.delegate !== false && (this.parent.delegate || findDelegate(this.parent));
    // delegation disabled by directive
    if (this.delegate && this.delegate.delegate === false) this.delegate = false;
    // let the element know it's a delegate handler
    if (this.delegate) this.delegate.delegate = this.delegate;

    // encapsulated styles should be inherited until they get applied by an element
    this.cssIds = 'cssIds' in options ? options.cssIds : this.parent ? this.parent.cssIds : null;

    this.context = null;
    this.rendered = false;
    this.iterations = [];

    this.template = options.template;

    this.indexRef = options.indexRef;
    this.keyRef = options.keyRef;

    this.pendingNewIndices = null;
    this.previousIterations = null;

    // track array versus object so updates of type rest
    this.isArray = false;
  }

  bind(context: Model): this {
    this.context = context;
    this.bound = true;
    const value = context.get();

    const aliases = (this.aliases = this.owner.template.z && this.owner.template.z.slice());

    const shuffler = aliases && aliases.find(a => a.n === 'shuffle');
    if (shuffler && shuffler.x && shuffler.x.x) {
      if (shuffler.x.x.s === 'true') this.shuffler = true;
      else if (keypathString.test(shuffler.x.x.s))
        this.shuffler = splitKeypath(shuffler.x.x.s.slice(1, -1));
    }

    if (this.shuffler) this.values = shuffleValues(this, this.shuffler);

    if (this.source) this.source.model.unbind(this.source);
    const source = context.isComputed && aliases && aliases.find(a => a.n === 'source');
    if (source && source.x && source.x.r) {
      const model = resolve(this, source.x);
      this.source = {
        handleChange() {},
        rebind(next) {
          this.model.unregister(this);
          this.model = next;
          next.register(this);
        }
      };
      this.source.model = model;
      model.register(this.source);
    }

    // {{#each array}}...
    if ((this.isArray = isArray(value))) {
      // we can't use map, because of sparse arrays
      this.iterations = [];
      const max = (this.length = value.length);
      for (let i = 0; i < max; i += 1) {
        this.iterations[i] = this.createIteration(i, i);
      }
    } else if (isObject(value)) {
      // {{#each object}}...
      this.isArray = false;

      // TODO this is a dreadful hack. There must be a neater way
      if (this.indexRef) {
        const refs = this.indexRef.split(',');
        this.keyRef = refs[0];
        this.indexRef = refs[1];
      }

      const ks = keys(value);
      this.length = ks.length;

      this.iterations = ks.map((key, index) => {
        return this.createIteration(key, index);
      });
    }

    return this;
  }

  bubble(index?: number): void {
    if (!this.bubbled) this.bubbled = [];
    this.bubbled.push(index);

    if (!this.rebounding) this.owner.bubble();
  }

  createIteration(key, index): Fragment {
    const fragment = new Fragment({
      owner: this,
      template: this.template
    });

    fragment.isIteration = true;
    fragment.delegate = this.delegate;

    if (this.aliases) fragment.aliases = {};
    swizzleFragment(this, fragment, key, index);

    return fragment.bind(fragment.context);
  }

  destroyed(): void {
    const len = this.iterations.length;
    for (let i = 0; i < len; i++) this.iterations[i].destroyed();
    if (this.pathModel) this.pathModel.destroyed();
    if (this.rootModel) this.rootModel.destroyed();
  }

  detach(): DocumentFragment {
    const docFrag = createDocumentFragment();
    this.iterations.forEach(fragment => docFrag.appendChild(fragment.detach()));
    return docFrag;
  }

  find(selector, options) {
    return findMap(this.iterations, i => i.find(selector, options));
  }

  findAll(selector, options) {
    return this.iterations.forEach(i => i.findAll(selector, options));
  }

  findAllComponents(name, options) {
    return this.iterations.forEach(i => i.findAllComponents(name, options));
  }

  findComponent(name, options) {
    return findMap(this.iterations, i => i.findComponent(name, options));
  }

  findContext() {
    return this.context;
  }

  findNextNode(iteration) {
    if (iteration.index < this.iterations.length - 1) {
      for (let i = iteration.index + 1; i < this.iterations.length; i++) {
        const node = this.iterations[i].firstNode(true);
        if (node) return node;
      }
    }

    return this.owner.findNextNode();
  }

  firstNode(skipParent) {
    return this.iterations[0] ? this.iterations[0].firstNode(skipParent) : null;
  }

  getLast() {
    return this.lastModel || (this.lastModel = new KeyModel(this.length - 1));
  }

  rebind(next): void {
    this.context = next;
    if (this.source) return;
    if (next) {
      this.iterations.forEach(fragment => {
        swizzleFragment(this, fragment, fragment.key, fragment.index);
      });
    }
  }

  rebound(update: boolean): void {
    this.context = this.owner.model;
    this.iterations.forEach((f, i) => {
      f.context = contextFor(this, f, i);
      f.rebound(update);
    });
  }

  render(target, occupants): void {
    const xs = this.iterations;
    if (xs) {
      const len = xs.length;
      for (let i = 0; i < len; i++) {
        xs[i].render(target, occupants);
      }
    }

    this.rendered = true;
  }

  shuffle(newIndices, merge) {
    if (!this.pendingNewIndices) this.previousIterations = this.iterations.slice();

    if (!this.pendingNewIndices) this.pendingNewIndices = [];

    this.pendingNewIndices.push(newIndices);

    const iterations = [];

    newIndices.forEach((newIndex, oldIndex) => {
      if (newIndex === -1) return;

      const fragment = this.iterations[oldIndex];
      iterations[newIndex] = fragment;

      if (newIndex !== oldIndex && fragment) {
        fragment.dirty = true;
        if (merge) fragment.shouldRebind = 1;
      }
    });

    this.iterations = iterations;

    // if merging, we're in the midst of an update already
    if (!merge) this.bubble();
  }

  shuffled(): void {
    this.iterations.forEach(shuffled);
  }

  toString(escape: boolean): string {
    return this.iterations ? this.iterations.map(escape ? toEscapedString : toString).join('') : '';
  }

  unbind(view): this {
    this.bound = false;
    if (this.source) this.source.model.unregister(this.source);
    const iterations = this.pendingNewIndices ? this.previousIterations : this.iterations;
    const len = iterations.length;
    for (let i = 0; i < len; i++) iterations[i].unbind(view);
    return this;
  }

  unrender(shouldDestroy: boolean): void {
    let len = this.iterations.length;
    for (let i = 0; i < len; i++) this.iterations[i].unrender(shouldDestroy);
    if (this.pendingNewIndices && this.previousIterations) {
      len = this.previousIterations.length;
      for (let i = 0; i < len; i++) this.previousIterations[i].unrender(shouldDestroy);
    }
    this.rendered = false;
  }

  update(): void {
    if (this.pendingNewIndices) {
      this.bubbled.length = 0;
      this.updatePostShuffle();
      return;
    }

    if (this.updating) return;
    this.updating = true;

    if (this.shuffler) {
      const values = shuffleValues(this, this.shuffler);
      const newIndices = buildNewIndices(this.values, values);
      if (!newIndices.same) {
        this.shuffle(newIndices, true);
        this.updatePostShuffle();
      } else {
        this.iterations.forEach(update);
      }
    } else {
      let len = this.iterations.length;
      for (let i = 0; i < len; i++) {
        const f = this.iterations[i];
        f && f.idxModel && f.idxModel.applyValue(i);
      }

      const value = this.context.get();
      const wasArray = this.isArray;

      let toRemove;
      let oldKeys;
      let reset = true;
      let i;

      if ((this.isArray = isArray(value))) {
        // if there's a source to map back to, make sure everything stays bound correctly
        if (this.source) {
          this.rebounding = 1;
          const source = this.source.model.get();
          this.iterations.forEach((f, c) => {
            if (c < value.length && f.lastValue !== value[c] && ~(i = source.indexOf(value[c]))) {
              swizzleFragment(this, f, c, c);
              f.rebound(true);
            }
          });
          this.rebounding = 0;
        }

        if (wasArray) {
          reset = false;
          if (this.iterations.length > value.length) {
            toRemove = this.iterations.splice(value.length);
          }
        }
      } else if (isObject(value) && !wasArray) {
        reset = false;
        toRemove = [];
        oldKeys = {};
        i = this.iterations.length;

        while (i--) {
          const fragment = this.iterations[i];
          if (fragment.key in value) {
            oldKeys[fragment.key] = true;
          } else {
            this.iterations.splice(i, 1);
            toRemove.push(fragment);
          }
        }
      }

      const newLength = isArray(value) ? value.length : isObject(value) ? keys(value).length : 0;
      this.length = newLength;
      this.updateLast();

      if (reset) {
        toRemove = this.iterations;
        this.iterations = [];
      }

      if (toRemove) {
        len = toRemove.length;
        for (let i = 0; i < len; i++) toRemove[i].unbind().unrender(true);
      }

      // update the remaining ones
      if (!reset && this.isArray && this.bubbled && this.bubbled.length) {
        const bubbled = this.bubbled;
        this.bubbled = [];
        len = bubbled.length;
        for (let i = 0; i < len; i++)
          this.iterations[bubbled[i]] && this.iterations[bubbled[i]].update();
      } else {
        len = this.iterations.length;
        for (let i = 0; i < len; i++) this.iterations[i].update();
      }

      // add new iterations
      let docFrag;
      let fragment;

      if (newLength > this.iterations.length) {
        docFrag = this.rendered ? createDocumentFragment() : null;
        i = this.iterations.length;

        if (isArray(value)) {
          while (i < value.length) {
            fragment = this.createIteration(i, i);

            this.iterations.push(fragment);
            if (this.rendered) fragment.render(docFrag);

            i += 1;
          }
        } else if (isObject(value)) {
          // TODO this is a dreadful hack. There must be a neater way
          if (this.indexRef && !this.keyRef) {
            const refs = this.indexRef.split(',');
            this.keyRef = refs[0];
            this.indexRef = refs[1];
          }

          keys(value).forEach(key => {
            if (!oldKeys || !(key in oldKeys)) {
              fragment = this.createIteration(key, i);

              this.iterations.push(fragment);
              if (this.rendered) fragment.render(docFrag);

              i += 1;
            }
          });
        }

        if (this.rendered) {
          const parentNode = this.parent.findParentNode();
          const anchor = this.parent.findNextNode(this.owner);

          parentNode.insertBefore(docFrag, anchor);
        }
      }
    }

    this.updating = false;
  }

  updateLast(): void {
    if (this.lastModel) this.lastModel.applyValue(this.length - 1);
  }

  updatePostShuffle(): void {
    const newIndices = this.pendingNewIndices[0];
    const parentNode = this.rendered ? this.parent.findParentNode() : null;
    const nextNode = parentNode && this.owner.findNextNode();
    const docFrag = parentNode ? createDocumentFragment() : null;

    // map first shuffle through
    this.pendingNewIndices.slice(1).forEach(indices => {
      newIndices.forEach((newIndex, oldIndex) => {
        newIndices[oldIndex] = indices[newIndex];
      });
    });

    const len = (this.length = this.context.get().length);
    const prev = this.previousIterations;
    const iters = this.iterations;
    const value = this.context.get();
    const stash = {};
    let idx, dest, pos, next, anchor, rebound;

    const map = new Array(newIndices.length);
    newIndices.forEach((e, i) => (map[e] = i));

    this.updateLast();

    idx = pos = 0;
    while (idx < len) {
      // if there's not an existing thing to shuffle, handle that
      if (isUndefined(map[idx])) {
        next = iters[idx] = this.createIteration(idx, idx);
        if (parentNode) {
          anchor = prev[pos];
          anchor = (anchor && parentNode && anchor.firstNode()) || nextNode;

          next.render(docFrag);
          parentNode.insertBefore(docFrag, anchor);
        }

        idx++;
      } else {
        dest = newIndices[pos];

        if (dest === -1) {
          // if it needs to be dropped, drop it
          prev[pos] && prev[pos].unbind().unrender(true);
          prev[pos++] = 0;
        } else if (dest > idx) {
          // if it needs to move down, stash it
          stash[dest] = prev[pos];
          prev[pos++] = null;
        } else {
          // get the fragment that goes for this idx
          iters[idx] = next = iters[idx] || stash[idx] || this.createIteration(idx, idx);

          // if it's an existing fragment, swizzle
          if (stash[idx] || pos !== idx) {
            rebound = this.source && next.lastValue !== value[idx];
            swizzleFragment(this, next, idx, idx);
          }

          // does next need to be moved?
          if (parentNode && (stash[idx] || !prev[pos])) {
            anchor = prev[pos + 1];
            anchor = (anchor && parentNode && anchor.firstNode()) || nextNode;

            if (stash[idx]) {
              parentNode.insertBefore(next.detach(), anchor);
            } else {
              next.render(docFrag);
              parentNode.insertBefore(docFrag, anchor);
            }
          }

          prev[pos++] = 0;
          idx++;
        }

        if (next && isObjectType<any>(next)) {
          if (next.shouldRebind || rebound) {
            next.rebound(rebound);
            next.shouldRebind = 0;
          }
          next.update();
          next.shuffled();
        }
      }
    }

    // clean up any stragglers
    const plen = prev.length;
    for (let i = 0; i < plen; i++) prev[i] && prev[i].unbind().unrender(true);

    if (this.shuffler) this.values = shuffleValues(this, this.shuffler);

    this.pendingNewIndices = null;
    this.previousIterations = null;
  }

  getContext = getContext;
  getKeypath = getKeypath;
}

// find the topmost delegate
function findDelegate(start): Element {
  let frag = start;
  let delegate, el;

  out: while (frag) {
    // find next element
    el = 0;
    while (!el && frag) {
      if (frag.owner.type === ELEMENT) el = frag.owner;
      if (frag.owner.ractive && frag.owner.ractive.delegate === false) break out;
      frag = frag.parent || frag.componentParent;
    }

    if (el.delegate === false) break out;
    delegate = el.delegate || el;

    // find next repeated fragment
    while (frag) {
      if (frag.iterations) break;
      if (frag.owner.ractive && frag.owner.ractive.delegate === false) break out;
      frag = frag.parent || frag.componentParent;
    }
  }
  return delegate;
}

function swizzleFragment(
  section: RepeatedFragment,
  fragment: Fragment,
  key: string | number,
  idx: number
): void {
  const model = section.context ? contextFor(section, fragment, key) : undefined;

  fragment.key = key;
  fragment.index = idx;
  fragment.context = model;
  if (section.source) fragment.lastValue = model && model.get();

  if (fragment.idxModel) fragment.idxModel.applyValue(idx);
  if (fragment.keyModel) fragment.keyModel.applyValue(key);
  if (fragment.pathModel) {
    fragment.pathModel.context = model;
    fragment.pathModel.applyValue(model.getKeypath());
  }
  if (fragment.rootModel) {
    fragment.rootModel.context = model;
    fragment.rootModel.applyValue(model.getKeypath(fragment.ractive.root));
  }

  // handle any aliases
  const aliases = fragment.aliases;
  section.aliases?.forEach(a => {
    if (a.x.r === '.') aliases[a.n] = model;
    else if (a.x.r === '@index') aliases[a.n] = fragment.getIndex();
    else if (a.x.r === '@key') aliases[a.n] = fragment.getKey();
    else if (a.x.r === '@keypath') aliases[a.n] = fragment.getKeypath();
    else if (a.x.r === '@rootpath') aliases[a.n] = fragment.getKeypath(true);
  });
}

function shuffleValues(section: RepeatedFragment, shuffler: true | any[]): any[] {
  const array = section.context.get() || [];
  if (shuffler === true) {
    return array.slice();
  } else {
    return array.map(v => shuffler.reduce((a, c) => a && a[c], v));
  }
}

function contextFor(section, _fragment, key) {
  if (section.source) {
    let idx;
    const source = section.source.model.get();
    if (source.indexOf && ~(idx = source.indexOf(section.context.joinKey(key).get())))
      return section.source.model.joinKey(idx);
  }

  return section.context.joinKey(key);
}
