import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // SQLite data file is shared: avoid parallel test files clobbering devstudio.db
    fileParallelism: false,
  },
})
