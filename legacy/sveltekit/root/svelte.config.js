module.exports = (async () => {
  const adapter = (await import("@sveltejs/adapter-auto")).default;
  const { vitePreprocess } = await import("@sveltejs/vite-plugin-svelte");

  return {
    preprocess: vitePreprocess(),
    kit: {
      adapter: adapter(),
    },
  };
})();
