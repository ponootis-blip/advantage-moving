"use strict";
const assert=require("node:assert/strict");
const {estimateMove,localDateInputValue,normalizeQuoteConfig,quoteReference}=require("../site.js");

assert.equal(normalizeQuoteConfig(),null);
assert.equal(normalizeQuoteConfig({provider:"formspree",endpoint:"https://formspree.io/f/REPLACE_WITH_FORMSPREE_FORM_ID"}),null);
assert.equal(normalizeQuoteConfig({provider:"formspree",endpoint:"http://formspree.io/f/abc123"}),null);
assert.equal(normalizeQuoteConfig({provider:"formspree",endpoint:"https://example.com/f/abc123"}),null);
assert.equal(normalizeQuoteConfig({provider:"web3forms",endpoint:"https://formspree.io/f/abc123"}),null);
assert.equal(normalizeQuoteConfig({provider:"formspree",endpoint:"https://formspree.io/f/abc123"}),"https://formspree.io/f/abc123");

const reference=quoteReference();
assert.match(reference,/^ADV-[A-Z0-9]{5}-[A-F0-9]{6}$/);
assert.equal(localDateInputValue(new Date(2026,9,4,23,30)),"2026-10-04");

assert.deepEqual(estimateMove({size:"two",distance:"local",miles:0,packing:false,piano:false}),{crew:3,hours:6,low:970,high:1300});
assert.deepEqual(estimateMove({size:"studio",distance:"state",miles:80,packing:true,piano:true}),{crew:2,hours:3,low:1140,high:1520});

console.log("PASS: quote configuration, references, and estimate logic");

// Opening-hours status in Austin time drives the "open now" badge and the lead's call-by time.
const {businessStatus,formatClock}=require("../site.js");
const daily={days:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],opens:"08:00",closes:"17:00"};
assert.deepEqual(businessStatus(daily,{day:"Tuesday",minutes:10*60+42}),{open:true,closesAt:"5pm",callBy:"10:47am"});
assert.deepEqual(businessStatus(daily,{day:"Tuesday",minutes:16*60+58}),{open:true,closesAt:"5pm",callBy:"5pm"});
assert.deepEqual(businessStatus(daily,{day:"Tuesday",minutes:6*60}),{open:false,next:"today at 8am"});
assert.deepEqual(businessStatus(daily,{day:"Tuesday",minutes:19*60}),{open:false,next:"tomorrow at 8am"});
const weekdays={days:["Monday","Tuesday","Wednesday","Thursday","Friday"],opens:"08:30",closes:"17:00"};
assert.deepEqual(businessStatus(weekdays,{day:"Friday",minutes:18*60}),{open:false,next:"Monday at 8:30am"});
assert.equal(formatClock(12*60),"12pm");
console.log("PASS: business hours status");
