import { splitKeypath, unescapeKey } from 'shared/keypaths';
import { handleChange, mark } from 'shared/methodCallers';
import { capture } from 'src/global/capture';
import type { Ractive } from 'src/Ractive/RactiveDefinition';
import type { Adaptor } from 'types/Adaptor';
import type { Keypath } from 'types/Generic';
import noop from 'utils/noop';
import type Fragment from 'view/Fragment';
import resolveReference from 'view/resolvers/resolveReference';

import type LinkModel from './LinkModel';
import Model from './Model';
import type ModelBase from './ModelBase';
import type { ModelGetOpts, ModelLinkOpts, ModelJoinOpts } from './ModelBase';
import RactiveModel from './specials/RactiveModel';
import SharedModel, { GlobalModel, SharedModel as SharedBase } from './specials/SharedModel';

const specialModels: Record<string, (root?: RootModel) => unknown> = {
  '@this'(root) {
    return root.getRactiveModel();
  },
  '@global'() {
    return GlobalModel;
  },
  '@shared'() {
    return SharedModel;
  },
  '@style'(root) {
    return root.getRactiveModel().joinKey('cssData');
  },
  '@helpers'(root) {
    return root.getHelpers();
  }
};
specialModels['@'] = specialModels['@this'];

export interface RootModelOpts {
  ractive: Ractive;
  data: unknown;
  adapt: Adaptor[];
}

/**
 * ### Dependencies
 * - ExpressionProxy
 * - PatternObserver
 * - Observer
 */
export default class RootModel extends Model {
  private helpers: SharedBase;
  private ractiveModel: RactiveModel;

  public adaptors: Adaptor[];

  constructor(options: RootModelOpts) {
    super(null, null);

    this.isRoot = true;
    this.root = this;
    this.ractive = options.ractive; // TODO sever this link

    this.value = options.data;
    this.adaptors = options.adapt;
    this.adapt();
  }

  attached(fragment: Fragment): void {
    attachImplicits(this, fragment);
  }

  createLink(
    keypath: Keypath,
    target: Model | LinkModel,
    targetPath: Keypath,
    options: ModelLinkOpts
  ): LinkModel {
    const keys = splitKeypath(keypath);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let model = this;
    while (keys.length) {
      const key = keys.shift();
      model = model.childByKey[key] || model.joinKey(key);
    }

    return model.link(target, targetPath, options);
  }

  detached(): void {
    detachImplicits(this);
  }

  get(shouldCapture: boolean, options?: ModelGetOpts): unknown {
    if (shouldCapture) capture(this);

    if (!options || options.virtual !== false) {
      const asd = this.getVirtual();
      return asd;
    } else {
      return this.value;
    }
  }

  getHelpers(): SharedBase {
    if (!this.helpers) this.helpers = new SharedBase(this.ractive.helpers, 'helpers', this.ractive);
    return this.helpers;
  }

  getKeypath(): Keypath {
    return '';
  }

  getRactiveModel(): RactiveModel {
    return this.ractiveModel || (this.ractiveModel = new RactiveModel(this.ractive));
  }

  getValueChildren(): ModelBase[] {
    const children = super.getValueChildren(this.value);

    this.children.forEach(child => {
      if (child._link) {
        const idx = children.indexOf(child);
        if (~idx) children.splice(idx, 1, child._link);
        else children.push(child._link);
      }
    });

    return children;
  }

  has(key: string): boolean {
    if (key[0] === '~' && key[1] === '/') key = key.slice(2);
    if (specialModels[key] || key === '') return true;

    if (super.has(key)) {
      return true;
    } else {
      const unescapedKey = unescapeKey(key);

      // mappings/links and computations
      if (this.childByKey[unescapedKey] && this.childByKey[unescapedKey]._link) return true;
    }
  }

  joinKey(key: string, opts?: ModelJoinOpts) {
    if (key[0] === '~' && key[1] === '/') key = key.slice(2);

    if (key[0] === '@') {
      const fn = specialModels[key];
      if (fn) return fn(this);
    } else {
      return super.joinKey(key, opts);
    }
  }

  set(value: unknown): void {
    // TODO wrapping root node is a baaaad idea. We should prevent this
    const wrapper = this.wrapper;
    if (wrapper) {
      const shouldTeardown = !wrapper.reset || wrapper.reset(value) === false;

      if (shouldTeardown) {
        wrapper.teardown();
        this.wrapper = null;
        this.value = value;
        this.adapt();
      }
    } else {
      this.value = value;
      this.adapt();
    }

    this.deps.forEach(handleChange);
    this.children.forEach(mark);
  }

  retrieve(): unknown {
    const cose = this.wrapper ? this.wrapper.get() : this.value;
    return cose;
  }

  teardown(): void {
    super.teardown();
    this.ractiveModel && this.ractiveModel.teardown();
  }

  update = noop;
}

function attachImplicits(model: RootModel, fragment: Fragment): void {
  // TSRChange - attach function doesn't exists on RootModel maybe this code is no longer valid?
  // if (model._link && model._link.implicit && model._link.isDetached()) {
  //   model.attach(fragment);
  // }

  // look for virtual children to relink and cascade
  for (const k in model.childByKey) {
    if (model.value) {
      if (k in model.value) {
        attachImplicits(model.childByKey[k], fragment);
      } else if (!model.childByKey[k]._link || model.childByKey[k]._link.isDetached()) {
        const mdl = resolveReference(fragment, k);
        if (mdl) {
          model.childByKey[k].link(mdl, k, { implicit: true });
        }
      }
    }
  }
}

function detachImplicits(model: RootModel): void {
  if (model._link && model._link.implicit) {
    model.unlink();
  }

  for (const k in model.childByKey) {
    detachImplicits(model.childByKey[k]);
  }
}
