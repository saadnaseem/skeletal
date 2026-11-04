// Shared helper: load Kekule.js (dist ESM build) plus its OpenBabel WASM in Node.
// The OB build in dist/extra is compiled for the web; this shims the three things that break:
//   1. Kekule.environment.nodeRequire is undefined in the ESM build
//   2. emscripten's file packager throws without window/location ("using preloaded data can only be done on a web page")
//   3. Node's fetch() cannot load the .wasm from a bare path; openbabel.js also overwrites onRuntimeInitialized
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';

export async function loadKekuleWithOB(kekuleDist) {
  const {Kekule} = await import(path.join(kekuleDist, 'kekule.esm.mjs'));
  const require = createRequire(import.meta.url);
  Kekule.environment.nodeRequire = require;          // ESM build leaves this undefined
  const extra = path.join(kekuleDist, 'extra');
  globalThis.location = {pathname: extra + '/'};     // emscripten file packager wants a web location
  const factory = require(path.join(extra, 'openbabel.js'));
  const data = fs.readFileSync(path.join(extra, 'openbabel.data'));
  await new Promise((resolve, reject) => {
    const inst = factory({
      locateFile: f => path.join(extra, f),
      wasmBinary: fs.readFileSync(path.join(extra, 'openbabel.wasm')),  // Node fetch() cannot load a bare path
      getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      print: () => {}, printErr: () => {},
    });
    const iv = setInterval(() => {
      if (!inst.calledRun) return;
      clearInterval(iv);
      globalThis.OpenBabelModule = factory;
      Kekule.OpenBabel.setModule(inst);
      Kekule.OpenBabel.enable(err => err ? reject(err) : resolve());
    }, 20);
  });
  delete globalThis.location;
  return Kekule;
}

// OpenBabel canonical SMILES (used as an independent referee for stereo/constitution).
export function makeObCan(Kekule) {
  const OBM = Kekule.OpenBabel.getModule();
  return function obCan(smi) {
    if (!smi) return null;
    const conv = new OBM.ObConversionWrapper();
    try {
      conv.setInFormatId('smi'); const m = new OBM.OBMol(); conv.readString(m, smi);
      if (m.NumAtoms() === 0) { m['delete'](); return null; }
      conv.setOutFormatId('can'); const out = conv.writeString(m, false).trim().split('\t')[0]; m['delete'](); return out;
    } finally { conv['delete'](); }
  };
}
