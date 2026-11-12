'use strict';
const assert=require('node:assert/strict');
const {clean,attributedName}=require('./trusted-voices.js');
assert.equal(attributedName('المصدر: صهيب اليعربي\nمتداول'),'صهيب اليعربي');
assert.equal(clean('خبر عاجل\nالمصدر: صهيب اليعربي\nمتداول'),'خبر عاجل\nالمصدر: صهيب اليعربي');
assert.equal(clean('خبر عاجل\nالمصدر: عهد الصليبي\n#متداول'),'خبر عاجل\nالمصدر: عهد الصليبي');
assert.equal(clean('خبر عن صهيب اليعربي\nمتداول'),'خبر عن صهيب اليعربي\nمتداول');
assert.equal(clean('خبر\nالمصدر: جهة أخرى\nمتداول'),'خبر\nالمصدر: جهة أخرى\nمتداول');
assert.equal(clean('قال صهيب اليعربي: "متداول"'),'قال صهيب اليعربي: "متداول"');
for(const n of ['صهيب الجابر','زين العابدين العكيدي','أمجد الساري','إبراهيم الحبش'])
 assert.equal(clean('خبر\nالمصدر: '+n+'\nمتداول'),'خبر\nالمصدر: '+n);
console.log('Voice attribution safety checks passed (10 cases)');
