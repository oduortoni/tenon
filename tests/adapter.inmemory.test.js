/**
 * Test: Functional Adapter Usage
 * 
 * Demonstrates how to use the functional adapters with:
 * 1. Either monad for error handling
 * 2. Pure model functions
 * 3. Functional query builder
 */

const { Either } = require('../lib/either');
const { createModel, required, minLength } = require('../lib');
const { Schema, Types, field, entity } = require('../lib');

// Use in-memory adapter for testing
const { createInMemoryAdapter } = require('../app/adapters/inmemory');

// --- Define Schema ---
const Todo = entity('Todo', {
  id: field(Types.id, { primaryKey: true }),
  text: field(Types.string, { required: true }),
  done: field(Types.boolean, { default: false }),
  priority: field(Types.number, { default: 1 })
});

const User = entity('User', {
  id: field(Types.id, { primaryKey: true }),
  name: field(Types.string, { required: true }),
  email: field(Types.string, { required: true, unique: true })
});

const schema = Schema({ Todo, User });

// --- Create Pure Models ---
const TodoModel = createModel({
  validate: (data) => {
    return required('text', 'Todo text is required')(data)
      .flatMap(minLength('text', 3, 'Todo must be at least 3 characters'));
  },
  defaults: {
    done: false,
    priority: 1
  }
});

const UserModel = createModel({
  validate: (data) => {
    return required('name', 'Name is required')(data)
      .flatMap(required('email', 'Email is required')(data));
  },
  transforms: [
    (data) => {
      if (data.email) {
        return Either.Right({ 
          ...data, 
          email: data.email.toLowerCase().trim() 
        });
      }
      return Either.Right(data);
    }
  ]
});

// --- Test the Functional Adapter ---
async function testFunctionalAdapter() {
  console.log('=== Testing Functional In-Memory Adapter ===\n');
  
  // 1. Create adapter
  const adapter = createInMemoryAdapter();
  
  // 2. Initialize schema
  await adapter.initializeSchema(schema);
  
  // 3. Get functional repository
  const todoFunctionalRepo = adapter.generateFunctionalRepository(schema, schema.entities.Todo);
  const userFunctionalRepo = adapter.generateFunctionalRepository(schema, schema.entities.User);
  
  console.log('1. Creating todos with validation...');
  
  // 4. Create todos with model validation
  const todo1Result = await TodoModel.create({ text: 'Learn functional programming' });
  const todo2Result = await TodoModel.create({ text: 'Write tests', priority: 2 });
  const invalidTodoResult = await TodoModel.create({ text: 'ab' }); // Too short
  
  console.log('Todo 1 validation:', todo1Result.isRight ? '✓ Valid' : `✗ ${todo1Result.value}`);
  console.log('Todo 2 validation:', todo2Result.isRight ? '✓ Valid' : `✗ ${todo2Result.value}`);
  console.log('Invalid todo validation:', invalidTodoResult.isLeft ? `✓ Correctly rejected: ${invalidTodoResult.value}` : '✗ Should have failed');
  
  // 5. Save valid todos using functional repository
  if (todo1Result.isRight) {
    const saveResult1 = await todoFunctionalRepo.create(todo1Result.value);
    console.log('\n2. Saving todo 1...');
    saveResult1.fold(
      error => console.log(`✗ Save failed: ${error}`),
      todo => console.log(`✓ Saved: ${todo.text} (id: ${todo.id})`)
    );
  }
  
  if (todo2Result.isRight) {
    const saveResult2 = await todoFunctionalRepo.create(todo2Result.value);
    console.log('\n3. Saving todo 2...');
    saveResult2.fold(
      error => console.log(`✗ Save failed: ${error}`),
      todo => console.log(`✓ Saved: ${todo.text} (priority: ${todo.priority})`)
    );
  }
  
  // 6. Query with functional builder
  console.log('\n4. Querying todos...');
  const queryResult = await todoFunctionalRepo.query()
    .where('done', false)
    .orderBy('priority', 'DESC')
    .limit(10)
    .execute();
  
  queryResult.fold(
    error => console.log(`✗ Query failed: ${error}`),
    todos => {
      console.log(`✓ Found ${todos.length} todos:`);
      todos.forEach(todo => {
        console.log(`  - ${todo.text} (priority: ${todo.priority}, done: ${todo.done})`);
      });
    }
  );
  
  // 7. Find by ID with error handling
  console.log('\n5. Finding todo by ID...');
  const findResult = await todoFunctionalRepo.findById(1);
  findResult.fold(
    error => console.log(`✗ ${error}`),
    todo => {
      if (todo) {
        console.log(`✓ Found: ${todo.text}`);
      } else {
        console.log('✗ Todo not found');
      }
    }
  );
  
  // 8. Test with invalid ID
  console.log('\n6. Finding non-existent todo...');
  const notFoundResult = await todoFunctionalRepo.findById(999);
  notFoundResult.fold(
    error => console.log(`✓ Correctly handled: ${error}`),
    todo => console.log('✗ Should have returned error')
  );
  
  // 9. Update with validation
  console.log('\n7. Updating todo...');
  const updateResult = await todoFunctionalRepo.update(1, { done: true });
  updateResult.fold(
    error => console.log(`✗ Update failed: ${error}`),
    updatedTodo => console.log(`✓ Updated: ${updatedTodo.text} is now ${updatedTodo.done ? 'done' : 'not done'}`)
  );
  
  // 10. Count todos
  console.log('\n8. Counting todos...');
  const countResult = await todoFunctionalRepo.count({ done: false });
  countResult.fold(
    error => console.log(`✗ Count failed: ${error}`),
    count => console.log(`✓ ${count} todos are not done`)
  );
  
  // 11. Test user model and repository
  console.log('\n9. Testing user model and repository...');
  const userResult = await UserModel.create({ 
    name: 'John Doe', 
    email: 'JOHN@EXAMPLE.COM ' // Will be normalized
  });
  
  if (userResult.isRight) {
    const saveUserResult = await userFunctionalRepo.create(userResult.value);
    saveUserResult.fold(
      error => console.log(`✗ User save failed: ${error}`),
      user => console.log(`✓ User saved: ${user.name} (email: ${user.email})`)
    );
  }
  
  console.log('\n=== Test Complete ===');
  console.log('\nSummary:');
  console.log('1. Either monad provides explicit error handling');
  console.log('2. Pure models validate and transform data');
  console.log('3. Functional repositories return Either monad results');
  console.log('4. Query builder enables composable queries');
  console.log('5. All dependencies remain explicit (no magic)');
}

// Run test
testFunctionalAdapter().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});

