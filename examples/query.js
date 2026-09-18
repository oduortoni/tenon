const Query = (run) => ({
	run,
	map: f => Query((x) => f(run(x)))
});


let q = Query(x => x + 1);
let q2 = q.map(x => x * x);

let result = q2.run(10);
console.log("Result: ", result);

let q3 = q2.map(x => x % 2 == 1? x + 1: x);
console.log(q3.run(10));
console.log(q3.run(11));
