export default {
  test: {
    setupFiles: [
      new URL("./repository-improvement-backend-br001.mutation.setup.mjs", import.meta.url).pathname,
    ],
  },
};
