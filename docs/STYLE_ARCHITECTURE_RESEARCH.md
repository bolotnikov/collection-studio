# Style fidelity: inspected implementations and implementation constraints

Research date: 2026-11-12. This record distinguishes inspected public source, documented product behavior, and recommendations for Collection Studio. Downloaded research copies are local-only under `local-sources/research/style-architecture/`; application code does not copy third-party implementation.

## Evidence boundary

Scenario has public agent skills and integrations. Its public skills are useful orchestration source; they are not its hosted generator, retrieval service or internal application backend. No such backend source was found or audited. Scenario UI findings below come from official published interface documentation, not a signed-in private workspace. No matched image-quality benchmark against Scenario or diffusion models was performed.

## Scenario: public agent instructions

Inspected `scenario-labs/skills` at commit `94cab3f1da47841f52d4c7b3ea8583aa13dd0eb9`.

- **Multi-reference composition:** each attachment receives an explicit role, concrete properties to transfer, and properties to exclude. References are ordered and named in the prompt. Its examples prioritize the style instruction, resolve conflicts between palette/content/style, and verify the reference IDs actually consumed by the generation request. This is more precise than attaching many images under one generic “match style” instruction. [Inspected source](https://github.com/scenario-labs/skills/blob/94cab3f1da47841f52d4c7b3ea8583aa13dd0eb9/skills/scenario-multi-reference/SKILL.md).
- **Review and repair:** the published comic workflow distinguishes defect review from aesthetic judgment. It records observed defects with source requirements and asset IDs, treats unobservable details separately from passes, compares replacements to earlier candidates, and keeps stronger earlier versions. Attempt caps do not reset merely because a stage label changes. These mechanisms are applicable to collectible cards even though comic-specific rules are not. [Inspected review source](https://github.com/scenario-labs/skills/blob/94cab3f1da47841f52d4c7b3ea8583aa13dd0eb9/skills/scenario-comic-creator/references/review-and-fix.md).
- **Style specification:** the published style library describes concrete rendering operations and forbidden visual traits rather than relying only on a style name. It also records unsuccessful style directions. This supports an evidence-backed, editable look specification and negative examples. Its artistic examples are not our project's target style and must not be imported as rules. [Inspected style source](https://github.com/scenario-labs/skills/blob/94cab3f1da47841f52d4c7b3ea8583aa13dd0eb9/skills/scenario-comic-creator/references/style-library.md).

## Scenario: documented architecture and UX

The official Node Agent description shows a vision/text LLM receiving source images, analyzing appearance and style, producing a tailored prompt, and passing that prompt plus the style image into an image generator. The agent constructs or edits a workflow; the node execution graph remains a separate artifact. The documentation does not establish that its private retrieval implementation uses any particular vector database or embedding model. [Node Agent documentation](https://help.scenario.com/articles/6218410180-node-agent-the-essentials).

Scenario Apps expose a small subset of workflow inputs, a generation action and result previews. Workflow authors select inputs and outputs for the simplified interface. This supports keeping producer-facing fields small while exposing rules and orchestration to advanced users separately. [Apps interface](https://help.scenario.com/articles/4685851202-introduction-to-scenario-apps), [workflow-to-App configuration](https://help.scenario.com/articles/1669206426-introduction-to-workflows).

The reference guide distinguishes style, composition, identity, palette and other roles. It recommends clear, relevant references and warns that additional weak or conflicting examples can dilute consistency. Model reference capabilities vary. Therefore a larger configurable reference budget is appropriate, but maximizing the number of attachments is not a quality guarantee. [Reference-role guide](https://learn.scenario.com/methods/give-references-a-role).

## IP-Adapter: actual reference conditioning code

Inspected Tencent IP-Adapter at commit `62e4af9d0c1ac7d5f8dd386a0ccf2211346af1a2`.

`IPAttnProcessor` splits text and image hidden states, projects image keys/values through dedicated layers, calculates image attention and adds its scaled contribution to the ordinary attention output. In this architecture reference influence is implemented inside model inference, not merely described in a prompt. [Attention processor, lines 141–173](https://github.com/tencent-ailab/IP-Adapter/blob/62e4af9d0c1ac7d5f8dd386a0ccf2211346af1a2/ip_adapter/attention_processor.py#L141).

`IPAdapter.get_image_embeds` processes images through the image encoder and projection model; `set_scale` adjusts adapter attention processors. This separation between image encoding and text conditioning explains why a compatible diffusion adapter can expose controls unavailable through an instruction-only hosted image generator. It does not prove superior fidelity on our cards without testing. [Image encoding and scale implementation](https://github.com/tencent-ailab/IP-Adapter/blob/62e4af9d0c1ac7d5f8dd386a0ccf2211346af1a2/ip_adapter/ip_adapter.py#L140).

## ComfyUI IPAdapter Plus: role separation and multiple references

Inspected commit `a0f451a5113cf9becb0847b92884cb10cbdec0ef`.

`ipadapter_execute` applies different layer-weight maps for style and composition; it supports multiple-image combination modes including concatenation, addition and averaging. `IPAdapterStyleComposition` exposes separate style and composition inputs/weights. These operations are specific to supported diffusion architectures and cannot be claimed as capabilities of our Codex image provider. [Conditioning and embedding combination](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/IPAdapterPlus.py#L307), [style/composition node](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/IPAdapterPlus.py#L878).

`CrossAttentionPatch` applies conditioning within configured diffusion sigma bounds. This is another concrete inference-time control, not a retrieval mechanism. [Attention patch](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/CrossAttentionPatch.py#L31).

ComfyUI's executor separates graph validation, execution and caching. The relevant lesson for our smaller application is explicit typed stage inputs, persisted outputs and resumable execution, rather than exposing a general graph editor to the producer. [Executor source](https://github.com/Comfy-Org/ComfyUI/blob/c5751c81abe131202eea9e4c66d000589013dd0b/execution.py#L671).

## Recommended implementation contract

The following are our engineering decisions, not claims about Scenario internals:

1. Keep immutable employer anchors separate from explicitly approved user examples. Generated results never become anchors automatically.
2. Index each available image with a vision-derived caption, materials, silhouette, composition category, environment, rendering properties and provenance. Preserve uncertainty and source hashes. Cache analysis by image hash and analyzer/rule version.
3. Retrieve using hard eligibility filters, category/material/theme relevance and diversity. A metadata or lexical implementation must be called that; do not claim embedding search unless embeddings actually run.
4. Have an analysis agent inspect the selected images and produce an ordered reference manifest: ID, role, take, exclude, reason. Include immutable style anchors in every pack. Allow more images when they add relevant evidence, bounded by a provider capability limit and a configurable budget.
5. Store a structured brief and rule IDs before prompt assembly. Separate non-overridable assignment constraints from editable art heuristics. Preserve the final rule snapshot, image IDs and exact prompt with each attempt.
6. Validate candidate content against the brief and style against anchors. Review the delivered crop and thumbnail, then compare the whole set against source references. Unknown or unobservable criteria cannot silently pass.
7. Require review after every generation. Retry defects up to the configured cap; distinguish exhausted retries from approval. Preserve prior candidates, detect regressions and return a review-needed state when quality remains insufficient.
8. Keep export deterministic. Verify dimensions, encoding and required files after processing. Export approval must be distinct from the existence of ten images.
9. Default UI: theme, optional art direction, generate, results. Put library, approval actions and advanced rules in dedicated views; show compact stage progress and expandable evidence instead of the whole internal prompt.

A longer prompt, more agents, or more attachments alone cannot establish style fidelity. The evidence required is a controlled comparison against fixed source art with explicit rejection criteria, traceable repairs and held-out visual checks.
