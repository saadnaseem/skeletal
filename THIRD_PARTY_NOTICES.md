# Third-party notices

## inchi-js and the IUPAC InChI library (bundled into dist/skeletal.html)

inchi-js 0.2.0, https://www.npmjs.com/package/inchi-js, MIT. It wraps the official IUPAC/InChI Trust InChI C library compiled to WebAssembly (InChI is distributed by the InChI Trust under the MIT license).

```
MIT License

Copyright (c) 2026 cheminfo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

================================================================================

This package bundles WebAssembly compiled from the official IUPAC InChI
C library (https://github.com/IUPAC-InChI/InChI). The `inchi_web.c`
JSON-emitting wrapper used in the WASM build is adapted from
https://github.com/IUPAC-InChI/InChI-Web-Demo. Both are distributed
under the MIT License, reproduced below:

--------------------------------------------------------------------------------
IUPAC InChI — https://github.com/IUPAC-InChI/InChI
--------------------------------------------------------------------------------

MIT License

Copyright (c) 2024 InChI Project

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## OpenChemLib JS (bundled into dist/skeletal.html)

Version 9.25.1, https://github.com/cheminfo/openchemlib-js, BSD-3-Clause:

```

Copyright (c) 2015-2017, cheminfo

All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of {{ project }} nor the names of its contributors
      may be used to endorse or promote products derived from this software
      without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Schibsted Grotesk (interface font)

Loaded at runtime from Google Fonts, SIL Open Font License 1.1. The app falls back to system fonts when offline.

## Reference data

Numerical values are factual data taken from, and credited to, these publications:

- NMR solvent and impurity shifts: Fulmer, G. R.; Miller, A. J. M.; Sherden, N. H.; Gottlieb, H. E.; Nudelman, A.; Stoltz, B. M.; Bercaw, J. E.; Goldberg, K. I. *Organometallics* **2010**, 29, 2176–2179. Extends Gottlieb, H. E.; Kotlyar, V.; Nudelman, A. *J. Org. Chem.* **1997**, 62, 7512–7515.
- Bond dissociation energies: Blanksby, S. J.; Ellison, G. B. *Acc. Chem. Res.* **2003**, 36, 255–263. Other R–X values follow the compilation by W. Reusch (Michigan State University) based on R. T. Sanderson; average bond enthalpies from the LibreTexts reference table T3.
- pKa values: D. H. Ripin and D. A. Evans pKa table; H. J. Reich and F. G. Bordwell DMSO compilation (organicchemistrydata.org); R. Williams water compilation.
- Hammett σ constants: Hansch, C.; Leo, A.; Taft, R. W. *Chem. Rev.* **1991**, 91, 165–195.
- ACS figure widths: ACS manuscript submission checklist (single column 240 pt, double column up to 504 pt).
