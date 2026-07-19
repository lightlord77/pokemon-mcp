# pogo-iv-slack Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code Skill (`pogo-iv-slack`) that processes pending Pokémon GO IV screenshots posted to the Slack channel `#calculo-iv-pogo` and posts the calculated IV back in the format `#Foto N - Pokemon <Nome> - IV <valor>`.

**Architecture:** No new code in the `pokemon-mcp` server. The deliverable is a single markdown Skill file consumed by Claude at runtime, orchestrating three already-existing capabilities: the Slack MCP connector (`mcp__claude_ai_Slack__*`), the `go_estimate_iv` MCP tool, and Claude's native vision. Photo numbering is derived by parsing the channel's own message history — no persisted counter.

**Tech Stack:** Markdown (Claude Code Skill format with YAML frontmatter). No runtime dependencies. Verification uses a throwaway Python/Pillow script to synthesize test screenshots (not part of the shipped product).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-18-pogo-iv-slack-design.md`.
- Slack channel: `calculo-iv-pogo`, channel ID `C0BJ3G44335` (already created this session).
- Message format (exact, case-sensitive): `#Foto N - Pokemon <Nome> - IV <valor>`.
- No new MCP tool, no persisted state file, no webhook — this is spec non-goals, do not add them.
- `go_estimate_iv` is called exactly as it exists today (`src/tools/go-iv.ts`) — do not modify the server.
- Ambiguity rule: 1 match → exact `iv_percent`; >1 match → `{min}%-{max}%` range across all matches; 0 matches or read failure → error message, `N` still increments.

---

### Task 1: Write the `pogo-iv-slack` Skill file

**Files:**
- Create: `.claude/skills/pogo-iv-slack/SKILL.md`

**Interfaces:**
- Consumes: `mcp__claude_ai_Slack__slack_read_channel`, `mcp__claude_ai_Slack__slack_read_file`, `mcp__claude_ai_Slack__slack_send_message`, `mcp__claude_ai_Slack__slack_search_channels` (fallback only), the `go_estimate_iv` MCP tool (params: `name_or_id: string`, `cp: number`, `hp: number`, `stardust_cost?: number`, `level?: number`; response JSON has a `matches` array of `{level, attack_iv, defense_iv, stamina_iv, iv_percent}`, or `isError: true` with a text error).
- Produces: nothing consumed by other tasks — this is the only task.

- [ ] **Step 1: Create the skill directory and write the file**

Create `/Users/gfontes/Documents/projects/pokemon/.claude/skills/pogo-iv-slack/SKILL.md` with exactly this content:

```markdown
---
name: pogo-iv-slack
description: Use when the user asks to check the calculo-iv-pogo Slack channel for new Pokémon GO IV screenshots, process pending photos there, or post calculated IVs back to that channel. Triggers on phrases like "confere o canal do IV", "processa as fotos do PoGo", "roda a skill do IV no slack".
---

# Calcular IV de screenshots do Pokémon GO postadas no Slack

## Quando usar

Use esta skill quando o usuário pedir para conferir ou processar imagens pendentes no canal do Slack `calculo-iv-pogo` e postar os IVs calculados de volta no canal. Não reage sozinha a mensagens novas — só roda quando invocada.

## Ferramentas usadas

- `mcp__claude_ai_Slack__slack_read_channel`
- `mcp__claude_ai_Slack__slack_read_file`
- `mcp__claude_ai_Slack__slack_send_message`
- `mcp__claude_ai_Slack__slack_search_channels` (só como fallback, se o channel_id fixo abaixo não funcionar mais)
- Tool `go_estimate_iv` (servidor MCP `pokemon-mcp`)
- Visão nativa (leitura da imagem baixada do Slack)

## Canal alvo

- Nome: `calculo-iv-pogo`
- ID: `C0BJ3G44335`

Se `slack_read_channel` retornar erro `channel_not_found` com esse ID, chame `slack_search_channels` com `query: "calculo-iv-pogo"`, pegue o `channel_id` atualizado da resposta, e use esse valor pelo resto da execução.

## Procedimento

1. **Ler o histórico do canal.**
   Chame `slack_read_channel` com `channel_id: "C0BJ3G44335"`. Se o histórico não cobrir tudo (canal antigo/muito ativo), pagine com `cursor` até ter mensagens suficientes para cobrir desde a última resposta desta skill (ver passo 2).

2. **Achar N atual.**
   Percorra as mensagens retornadas da mais recente para a mais antiga. Ache a primeira cujo texto bate com o regex `^#Foto (\d+) - Pokemon`. Extraia o número capturado como `N`. Se nenhuma mensagem bater (primeira execução no canal, ou mensagem anterior foi editada/apagada), `N = 0`.

3. **Listar imagens pendentes.**
   Entre as mensagens do canal, selecione as que têm um arquivo de imagem anexado (campo `files`, com `mimetype` começando em `image/`) cujo timestamp (`ts`) é maior que o da mensagem achada no passo 2 (ou todas, se `N = 0`). Ordene da mais antiga para a mais nova — essa é a ordem de processamento.

   Se a lista estiver vazia: responda ao usuário "Nenhuma imagem pendente no #calculo-iv-pogo." e pare aqui.

4. **Para cada imagem pendente, nessa ordem:**

   a. Baixe o arquivo com `slack_read_file`, usando o `file_id` do anexo.

   b. Leia a imagem baixada com sua visão nativa. Extraia:
      - Nome da espécie do Pokémon
      - CP (Combat Power)
      - HP (vida máxima)
      - Custo de stardust do botão "Power Up", se visível

      Se a imagem não for uma screenshot legível do Pokémon GO, ou CP/HP não forem legíveis: defina `resultado = erro` com uma frase curta do motivo (ex.: "imagem não é uma screenshot do jogo", "CP/HP ilegíveis") e pule direto para o passo (e).

   c. Chame a tool `go_estimate_iv` com `name_or_id` (espécie lida), `cp`, `hp`, e `stardust_cost` (se legível — **não invente um valor se não estiver visível**, simplesmente omita o parâmetro).

      Se a resposta vier com `isError: true`: `resultado = erro` com o texto de erro da tool, pule para o passo (e).

   d. Olhe o array `matches` da resposta:
      - **Exatamente 1 item:** `resultado = "{iv_percent}%"` desse item.
      - **Mais de 1 item:** ache o menor e o maior `iv_percent` entre todos os itens; `resultado = "{min}%-{max}%"`.
      - **Zero itens:** `resultado = erro` com "CP/HP não batem com nenhuma combinação de IV válida — confira os números lidos".

      Nota: como o jogo não mostra o nível diretamente na tela (só o custo de stardust do power-up, que geralmente cobre 2 níveis candidatos), o caso mais comum na prática é a faixa (`min%-max%`), não um valor exato — isso é esperado, não é bug.

   e. Monte a mensagem:
      - Sem erro: `#Foto {N+1} - Pokemon {Nome} - IV {resultado}`
      - Com erro: `#Foto {N+1} - Pokemon {Nome ou "desconhecido"} - não foi possível calcular o IV ({motivo})`

   f. Poste a mensagem com `slack_send_message`, `channel_id: "C0BJ3G44335"`.

   g. `N = N + 1`. Se houver mais imagens pendentes na lista, volte ao início do passo 4 para a próxima.

5. **Ao terminar todas as imagens pendentes**, responda ao usuário com um resumo: quantas fotos foram processadas e o resultado de cada uma.

## Formato de mensagem — referência rápida

| Situação | Exemplo |
|---|---|
| IV ambíguo (caso mais comum) | `#Foto 6 - Pokemon Pikachu - IV 60%-100%` |
| IV exato (raro — só se `level` puder ser inferido com certeza) | `#Foto 5 - Pokemon Charmander - IV 87%` |
| Erro de leitura/cálculo | `#Foto 7 - Pokemon desconhecido - não foi possível calcular o IV (CP/HP ilegíveis)` |
```

- [ ] **Step 2: Validate the frontmatter parses correctly**

Run:
```bash
python3 -c "
import re
text = open('/Users/gfontes/Documents/projects/pokemon/.claude/skills/pogo-iv-slack/SKILL.md').read()
m = re.match(r'^---\n(.*?)\n---\n', text, re.DOTALL)
assert m, 'frontmatter block not found'
import yaml
fm = yaml.safe_load(m.group(1))
assert 'name' in fm and fm['name'] == 'pogo-iv-slack', fm
assert 'description' in fm and len(fm['description']) > 20, fm
print('OK', fm['name'])
"
```
Expected output: `OK pogo-iv-slack` (install `pyyaml` first with `pip3 install --quiet --user pyyaml` if the import fails).

- [ ] **Step 3: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add .claude/skills/pogo-iv-slack/SKILL.md
git commit -m "$(cat <<'EOF'
Add pogo-iv-slack skill: process Pokémon GO IV screenshots from Slack

Orchestrates the Slack MCP connector, native vision, and the existing
go_estimate_iv tool to read pending screenshots in #calculo-iv-pogo and
post back calculated IVs. No server code changes — pure Skill procedure.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Functional verification against the real Slack channel

**Files:**
- Create (scratchpad only, not committed): a throwaway Python script to generate synthetic test screenshots, at `/private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/gen_test_shot.py`.

**Interfaces:**
- Consumes: the Skill from Task 1, plus the same tool set it uses.
- Produces: nothing — this is the final task.

Since there's no real Pokémon GO screenshot available in this environment, this task synthesizes plain images containing the same text a real screenshot would show (species, CP, HP, stardust cost) so Claude's vision can read them the same way it would read a real screenshot. This tests the full pipeline (Slack round-trip, N-parsing, `go_estimate_iv` call, ambiguity handling, message formatting) — it does **not** test vision accuracy against a real busy mobile-game UI, which can't be scripted here.

- [ ] **Step 1: Write the synthetic screenshot generator**

Create `gen_test_shot.py` in the scratchpad directory:

```python
import sys
from PIL import Image, ImageDraw, ImageFont

def make_shot(path, species, cp, hp, stardust_cost=None):
    img = Image.new("RGB", (400, 300), color=(20, 20, 30))
    draw = ImageDraw.Draw(img)
    lines = [f"{species}", f"CP {cp}", f"HP {hp}"]
    if stardust_cost is not None:
        lines.append(f"Power Up: {stardust_cost} Stardust")
    y = 40
    for line in lines:
        draw.text((30, y), line, fill=(255, 255, 255))
        y += 40
    img.save(path)

if __name__ == "__main__":
    # species, cp, hp, stardust_cost, output_path
    args = sys.argv[1:]
    species, cp, hp = args[0], int(args[1]), int(args[2])
    stardust = int(args[3]) if args[3] != "-" else None
    make_shot(args[4], species, cp, hp, stardust)
    print(f"wrote {args[4]}")
```

- [ ] **Step 2: Generate the Pikachu test image (known values, CP/HP/stardust legible)**

Using the values already verified earlier in this project (Pikachu, level 25, CP 670, HP 84, stardust cost 4000 — confirmed via `go_get_pokemon` and `go_estimate_iv` during the server's own build-out):

```bash
python3 /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/gen_test_shot.py Pikachu 670 84 4000 /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/shot1_pikachu.png
```
Expected output: `wrote /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/shot1_pikachu.png`

- [ ] **Step 3: Post it to `#calculo-iv-pogo` and invoke the skill**

Upload `shot1_pikachu.png` to the Slack channel `calculo-iv-pogo` (channel ID `C0BJ3G44335`), then ask Claude (in a normal message) to check the channel — this should trigger the `pogo-iv-slack` skill via its description match.

Expected: a message posted to the channel reading exactly `#Foto 1 - Pokemon Pikachu - IV 73.3%-100%` — this is the exact range already verified for CP 670 / HP 84 / stardust 4000 earlier in this session (candidate levels 25 and 25.5, `iv_percent` values 100, 93.3, 82.2, 77.8, 73.3 → min 73.3%, max 100%). If the posted range differs, the discrepancy is in how the skill read the image or called the tool, not in the expected value — debug against this known-correct number.

- [ ] **Step 4: Generate and post a second image with NO stardust cost, verify sequential numbering AND the wide-ambiguity fallback**

Bulbasaur's real base stats are attack 118 / defense 111 / stamina 128. At level 20 with IVs 10/10/10 this computes to CP 590, HP 82 (verified with the same formula `go_estimate_iv` uses). This image omits stardust cost entirely, exercising the spec's "no stardust visible" fallback path (spec verification item 4), which searches all 89 candidate levels instead of 1-2 and should return a much wider range than Step 3's.

```bash
python3 /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/gen_test_shot.py Bulbasaur 590 82 - /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/shot2_bulbasaur.png
```
Post `shot2_bulbasaur.png` to the same channel (with no stardust cost visible in the image — the skill should call `go_estimate_iv` without `stardust_cost`), then ask Claude to check the channel again.

Expected: a new message starting with `#Foto 2 - Pokemon Bulbasaur - IV` followed by a range that is **wider** than Step 3's (e.g. spans most of 0%-100%, since dozens of levels are candidates) — confirming both correct sequential numbering (`#Foto 2`, proving N was parsed from the prior `#Foto 1` message) and the wide-fallback ambiguity behavior.

- [ ] **Step 5: Post two images before invoking, verify batch ordering**

Generate two more images and post both to the channel *before* asking Claude to check it:

Charmander (base attack 116 / defense 93 / stamina 118) at level 15 with IVs 8/8/8 computes to CP 374, HP 65. Squirtle (base attack 94 / defense 121 / stamina 127) at level 18 with IVs 12/5/9 computes to CP 445, HP 77 (both verified with the same formula `go_estimate_iv` uses):

```bash
python3 /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/gen_test_shot.py Charmander 374 65 - /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/shot3_charmander.png
python3 /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/gen_test_shot.py Squirtle 445 77 - /private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/shot4_squirtle.png
```

Expected: after invoking, two new messages appear in order — `#Foto 3 - Pokemon Charmander - IV ...` then `#Foto 4 - Pokemon Squirtle - IV ...` (both with a valid range, since neither has stardust) — proving both pending images were processed chronologically in a single run.

- [ ] **Step 6: Post an irrelevant image, verify graceful error handling**

```bash
python3 -c "
from PIL import Image
Image.new('RGB', (200, 200), color=(200, 200, 200)).save('/private/tmp/claude-502/-Users-gfontes-Documents-projects-pokemon/32b4d601-65c9-429b-9849-7ec7800fa592/scratchpad/shot5_blank.png')
"
```
Post `shot5_blank.png` (a blank gray square, not a game screenshot) to the channel, invoke the skill.

Expected: `#Foto 5 - Pokemon desconhecido - não foi possível calcular o IV (imagem não é uma screenshot do jogo)` (or equivalent wording) — critically, **N still increments to 5** and no exception/crash occurs.

- [ ] **Step 7: Record verification results**

Update the spec file's "Verificação" section (`docs/superpowers/specs/2026-07-18-pogo-iv-slack-design.md`) by appending a short "Resultados" note confirming each of the 5 scenarios above passed (or documenting any deviation found and the fix applied to `SKILL.md`), then commit:

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add docs/superpowers/specs/2026-07-18-pogo-iv-slack-design.md
git commit -m "$(cat <<'EOF'
Record pogo-iv-slack functional verification results

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
