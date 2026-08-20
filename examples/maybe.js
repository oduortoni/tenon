
const Maybe = {
	Some: (value) => {
		let r = {found: true, value};
		console.log(`R: ${r}`);
		return r;
	},
	None: () => {
		return {found: false}
	},
	map: (maybe, fn) => {
		if(maybe.found) {
			return Maybe.Some(fn(maybe.value));
		}
		return Maybe.None();
	},
};

function love(person) {
	if(person.love) {
		let ret = Maybe.Some(person.name);
		console.log(`RET ${ret}`);
		return ret;
	}
	return Maybe.None();
}

console.log(love({love: true, name: "Rij"}));
console.log(love({love: false, name: "Rij"}));
console.log(love({love: true, name: "Alaine"}));

const m = Maybe.Some("vic");

const upcaseit = (value) => {
	return value.toUpperCase();
};

console.log(Maybe.map(m, upcaseit));
