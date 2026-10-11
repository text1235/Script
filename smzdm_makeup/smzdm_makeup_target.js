'use strict';
const control=require('./smzdm_makeup_control.js');
control.main('target').then(control.display).catch(()=>{console.error('Setting/detection failed; no card request made.');process.exitCode=1;});
