// Jasmine helper: preload Kekule's OpenBabel WASM under Node (the unit tests expect a browser).
const fs = require('fs'), path = require('path');
// Run from Kekule.js/unitTests:
//   KEKULE_SRC=../src npx jasmine --config=spec/support/jasmine.json --helper=/abs/path/kekule_jasmine_ob_helper.js './io/*Test.js'
const OBDIR = path.resolve(process.env.KEKULE_SRC || '../src', '_extras/OpenBabel');
beforeAll(function(done) {
  Kekule.modules('openbabel', function(err) {
    if (err) return done.fail(err);
    globalThis.location = {pathname: OBDIR + '/'};
    const factory = require(path.join(OBDIR, 'openbabel.js.dev'));
    const data = fs.readFileSync(path.join(OBDIR, 'openbabel.data'));
    const inst = factory({
      locateFile: f => path.join(OBDIR, f),
      wasmBinary: fs.readFileSync(path.join(OBDIR, 'openbabel.wasm')),
      getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      print() {}, printErr() {},
    });
    const iv = setInterval(function() {
      if (!inst.calledRun) return;
      clearInterval(iv);
      delete globalThis.location;
      globalThis.OpenBabelModule = factory;
      Kekule.OpenBabel.setModule(inst);
      Kekule.OpenBabel.enable(function() { done(); });
    }, 20);
  });
}, 60000);
