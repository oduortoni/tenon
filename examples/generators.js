
function* generate() {
	yield "one"
	yield "two"
	yield "three"
	yield "four"
}

const gen = generate();

while(true) {
	let {value, done} = gen.next();
	if(done) {
		break;
	}
	console.log(value);
}




