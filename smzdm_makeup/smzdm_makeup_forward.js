'use strict';
const control=require('./smzdm_makeup_control.js');
control.main('forward').then(control.display).catch(()=>{console.error('Setting failed; no card request made.');process.exitCode=1;});
