const { createSQLiteAdapter } = require('./app/adapters/sqlite_unified.js');
const { Schema, Types, field, entity } = require('./lib');

// Create a simple schema
const Todo = entity('Todo', {
    id: field(Types.id, { primaryKey: true }),
    text: field(Types.string, { required: true }),
    done: field(Types.boolean, { default: false })
});

const schema = Schema({ Todo });

async function test() {
    console.log('Testing unified SQLite adapter...');
    
    // Create adapter with functional extensions enabled
    const adapter = createSQLiteAdapter({
        filename: ':memory:', // In-memory database for testing
        functional: true
    });
    
    console.log('✓ Adapter created');
    
    // Initialize schema
    await adapter.initializeSchema(schema);
    console.log('✓ Schema initialized');
    
    // Get standard repository
    const standardRepo = adapter.generateRepository(schema, schema.entities.Todo);
    console.log('✓ Standard repository created');
    
    // Get functional repository
    const functionalRepo = adapter.generateFunctionalRepository(schema, schema.entities.Todo);
    console.log('✓ Functional repository created');
    
    // Test standard repository
    const standardTodo = await standardRepo.create({ text: 'Test standard todo' });
    console.log('✓ Standard repository created todo:', standardTodo);
    
    // Test functional repository
    const functionalResult = await functionalRepo.create({ text: 'Test functional todo' });
    console.log('✓ Functional repository result:');
    functionalResult.fold(
        error => console.log('  ✗ Error:', error),
        todo => console.log('  ✓ Success:', todo)
    );
    
    // Test functional query
    const queryResult = await functionalRepo.query()
        .where('done', false)
        .execute();
    
    queryResult.fold(
        error => console.log('  ✗ Query error:', error),
        todos => console.log(`  ✓ Query found ${todos.length} todos`)
    );
    
    console.log('\n✅ Unified adapter test complete!');
}

test().catch(console.error);
