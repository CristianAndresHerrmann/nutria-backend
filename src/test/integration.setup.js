const { clearDatabase, prisma } = require('./integration');

beforeEach(clearDatabase);
afterAll(async () => prisma.$disconnect());
