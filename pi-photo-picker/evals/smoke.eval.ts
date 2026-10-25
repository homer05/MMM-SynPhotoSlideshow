import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "The agent picks the next slideshow photo with the random picker.",
  async test(t) {
    await t.send(
      "Katalog: a.jpg, b.jpg, c.jpg. Wähle jetzt genau ein nächstes Bild mit dem Tool pick_random_photo und antworte mit dem Pfad.",
    );
    t.succeeded();
    t.calledTool("pick_random_photo");
  },
});
