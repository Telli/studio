import { defineRule, type ESTree } from "@oxlint/plugins";

// Studio's law 1: the person sees engineering words, never git's. Studio's projects are git
// repositories underneath, so its code is full of these words; only the text a person reads
// is checked.
const GIT_WORD =
  /\b(git|commits?|committed|committing|branch(?:es)?|push(?:es|ed|ing)?|pull requests?|merg(?:e|es|ed|ing)|repos?|repositor(?:y|ies)|checkout|rebas(?:e|es|ed|ing)|stash(?:es|ed)?)\b/iu;

// Props and object keys whose string is text a person reads.
const TEXT_NAME =
  /^(?:aria-label|aria-description|alt|caption|children|description|heading|hint|label|message|note|placeholder|subtitle|summary|text|title|tooltip)$|(?:Label|Text|Title|Description|Message|Hint)$/u;

const PASS_THROUGH =
  /^(?:ConditionalExpression|LogicalExpression|BinaryExpression|TemplateLiteral|ParenthesizedExpression|ArrayExpression|TSAsExpression|TSSatisfiesExpression)$/u;

const nameOf = (node: ESTree.Node | null | undefined): string | null => {
  if (!node) return null;
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  return null;
};

/** Whether a string, wherever its conditionals and concatenations lead, is shown as text. */
function isShownText(node: ESTree.Node): boolean {
  let child: ESTree.Node = node;
  for (let current = node.parent; current; current = current.parent) {
    if (PASS_THROUGH.test(current.type)) {
      // A condition's test or a comparison is not what is shown.
      if (current.type === "ConditionalExpression" && current.test === child) return false;
      if (current.type === "BinaryExpression" && current.operator !== "+") return false;
      child = current;
      continue;
    }
    if (current.type === "JSXExpressionContainer") {
      const owner = current.parent;
      if (owner?.type === "JSXElement" || owner?.type === "JSXFragment") return true;
      child = current;
      continue;
    }
    if (current.type === "JSXAttribute") return TEXT_NAME.test(nameOf(current.name) ?? "");
    if (current.type === "Property") {
      return current.value === child && TEXT_NAME.test(nameOf(current.key) ?? "");
    }
    if (current.type === "NewExpression") {
      return current.callee.type === "Identifier" && current.callee.name === "Error";
    }
    return false;
  }
  return false;
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Studio's law 1: text a person reads uses engineering words (Project, Version, Sync, Revision, Design option, Change request), never git's.",
    },
  },
  create(context) {
    const check = (node: ESTree.Node, text: string) => {
      const found = GIT_WORD.exec(text);
      if (found === null) return;
      context.report({
        node,
        message: `"${found[0]}" is a git word (Studio's law 1). Say Project, Version, Sync, Revision, Design option, Change request or Approve change.`,
      });
    };
    return {
      JSXText(node) {
        check(node, node.value);
      },
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (isShownText(node)) check(node, node.value);
      },
      TemplateElement(node) {
        const template = node.parent;
        if (template && isShownText(template)) check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
});
