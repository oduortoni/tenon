const Reader = (run) => ({
    run,
    map: (f) => Reader((env) => run(env).then(f)),
    flatMap: (f) => Reader((env) => run(env).then(result => f(result).run(env)))
});

// Helper functions
Reader.unit = (value) => Reader(() => Promise.resolve(value));

// Lift a function that returns a Promise
Reader.lift = (fn) => Reader((env) => fn(env));

// Run a Reader with an environment
Reader.run = (reader, env) => reader.run(env);

// Compose Readers
Reader.compose = (reader1, reader2) => 
    Reader((env) => reader1.run(env).then(() => reader2.run(env)));

module.exports = Reader;

