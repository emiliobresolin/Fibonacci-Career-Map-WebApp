"""
One-shot shard tool: reads planning-artifacts/stories.md and emits one BMAD-template
story file per `### STORY-E{n}.{m}` block under implementation-artifacts/.

Also emits sprint-status.yaml with every story keyed as `{epic}-{story}-{kebab-title}`
and set to status: backlog.

This script is idempotent; running it again regenerates all files from the source index.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMPL_DIR = HERE.parent
PLANNING_DIR = IMPL_DIR.parent / "planning-artifacts"
STORIES_MD = PLANNING_DIR / "stories.md"
SPRINT_STATUS = IMPL_DIR / "sprint-status.yaml"

STORY_HEADER_RE = re.compile(r"^###\s+STORY-E(\d+)\.(\d+)\s+[—-]\s+(.+?)\s*$", re.MULTILINE)
APPENDIX_RE = re.compile(r"^##\s+Appendix", re.MULTILINE)


def kebab(s: str) -> str:
    s = s.lower().strip()
    # replace non-alphanumeric with -
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def parse_stories(md: str) -> list[dict]:
    # find the boundaries of each story block
    matches = list(STORY_HEADER_RE.finditer(md))
    # find first appendix index (stories stop before appendices)
    app_match = APPENDIX_RE.search(md)
    appendix_start = app_match.start() if app_match else len(md)

    blocks: list[dict] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else appendix_start
        body_start = m.end()
        body = md[body_start:end].strip()

        epic = int(m.group(1))
        story = int(m.group(2))
        title = m.group(3).strip()
        blocks.append({
            "epic": epic,
            "story": story,
            "title": title,
            "body": body,
            "story_id": f"{epic}.{story}",
            "story_key": f"{epic}-{story}-{kebab(title)}",
        })
    return blocks


def extract_ac_bullets(body: str) -> list[str]:
    """Extract bullets under the `AC:` heading."""
    m = re.search(r"^AC:\s*\n(.*?)(?=\n\s*\n|\nDepends on:|\Z)", body, re.DOTALL | re.MULTILINE)
    if not m:
        return []
    block = m.group(1)
    bullets: list[str] = []
    for raw in block.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.lstrip().startswith("- "):
            bullets.append(line.lstrip()[2:].strip())
        elif bullets:
            # continuation of previous bullet
            bullets[-1] = bullets[-1] + " " + line.strip()
    return bullets


def extract_narrative(body: str) -> tuple[str, str, str, str]:
    """Parse opening paragraph. Returns (article, role, action, benefit).

    article is 'a' or 'an' as written in source; empty if pattern didn't match.
    benefit may be empty if the source lacks a 'so that' clause.
    """
    # Grab text before first blank line
    first_para_match = re.match(r"\s*(.+?)\n\s*\n", body, re.DOTALL)
    if not first_para_match:
        alt = re.match(r"\s*(.+?)(?:\nAC:|\Z)", body, re.DOTALL)
        para = alt.group(1) if alt else body
    else:
        para = first_para_match.group(1)
    para = re.sub(r"\s+", " ", para).strip()

    # Full pattern with "so [that]"
    m = re.match(
        r"^As\s+(an?)\s+(.+?),\s+I\s+want\s+(.+?)\s+so(?:\s+that)?\s+(.+?)\.?\s*$",
        para,
        re.IGNORECASE,
    )
    if m:
        return (
            m.group(1).lower(),
            m.group(2).strip(),
            m.group(3).strip().rstrip(","),
            m.group(4).strip().rstrip("."),
        )

    # No "so that" clause — action runs to end
    m = re.match(
        r"^As\s+(an?)\s+(.+?),\s+I\s+want\s+(.+?)\.?\s*$",
        para,
        re.IGNORECASE,
    )
    if m:
        return (
            m.group(1).lower(),
            m.group(2).strip(),
            m.group(3).strip().rstrip("."),
            "",
        )

    # Salvage role only
    m = re.match(r"^As\s+(an?)\s+(.+?),\s+(.+)$", para, re.IGNORECASE)
    if m:
        rest = m.group(3).strip()
        # strip leading "I want " if present
        rest = re.sub(r"^I\s+want\s+", "", rest, flags=re.IGNORECASE).rstrip(".")
        return m.group(1).lower(), m.group(2).strip(), rest, ""

    return "", "", "", ""


def extract_depends(body: str) -> str:
    m = re.search(r"^Depends on:\s*(.+?)(?:\.\s*Refs:|\.\s*$|\n|\Z)", body, re.MULTILINE)
    if m:
        val = m.group(1).strip().rstrip(".")
        return val
    return ""


def extract_refs(body: str) -> str:
    m = re.search(r"Refs:\s*(.+?)(?:\n\s*\n|\Z)", body, re.DOTALL)
    if m:
        return re.sub(r"\s+", " ", m.group(1).strip()).rstrip(".")
    return ""


def render_story_file(b: dict) -> str:
    article, role, action, benefit = extract_narrative(b["body"])
    if not article:
        article = "a"
    ac_bullets = extract_ac_bullets(b["body"])
    depends = extract_depends(b["body"])
    refs = extract_refs(b["body"])

    lines: list[str] = []
    lines.append(f"# Story {b['epic']}.{b['story']}: {b['title']}")
    lines.append("")
    lines.append("Status: backlog")
    lines.append("")
    lines.append("## Story")
    lines.append("")
    lines.append(f"As {article} {role or 'TBD'},")
    if benefit:
        lines.append(f"I want {action or 'TBD'},")
        lines.append(f"so that {benefit}.")
    else:
        lines.append(f"I want {action or 'TBD'}.")
    lines.append("")
    lines.append("## Acceptance Criteria")
    lines.append("")
    if ac_bullets:
        for i, ac in enumerate(ac_bullets, 1):
            lines.append(f"{i}. {ac}")
    else:
        lines.append("1. [Derive from Epic / PRD]")
    lines.append("")
    lines.append("## Tasks / Subtasks")
    lines.append("")
    if ac_bullets:
        for i, _ in enumerate(ac_bullets, 1):
            lines.append(f"- [ ] Task covering AC #{i}")
    else:
        lines.append("- [ ] Task 1 (AC: #)")
    lines.append("")
    lines.append("## Dev Notes")
    lines.append("")
    lines.append("- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.")
    lines.append("- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.")
    lines.append("- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).")
    lines.append("")
    lines.append("### Dependencies")
    lines.append("")
    if depends and depends.lower() not in {"none", "—", ""}:
        for tok in re.split(r",\s*|\s+and\s+", depends):
            tok = tok.strip()
            if tok:
                lines.append(f"- {tok}")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("### References")
    lines.append("")
    if refs:
        # split refs on semicolons or commas for readability
        parts = re.split(r";\s*", refs)
        for p in parts:
            p = p.strip().rstrip(",")
            if p:
                lines.append(f"- {p}")
    else:
        lines.append("- [Source: planning-artifacts/prd.md]")
        lines.append("- [Source: planning-artifacts/architecture.md]")
        lines.append("- [Source: planning-artifacts/epics.md]")
    lines.append("- [Source: planning-artifacts/stories.md — index entry for this story]")
    lines.append("")
    lines.append("## Dev Agent Record")
    lines.append("")
    lines.append("### Agent Model Used")
    lines.append("")
    lines.append("### Debug Log References")
    lines.append("")
    lines.append("### Completion Notes List")
    lines.append("")
    lines.append("### File List")
    lines.append("")
    return "\n".join(lines)


def write_sprint_status(blocks: list[dict]) -> None:
    lines: list[str] = []
    lines.append("# FCM Sprint Status")
    lines.append("# Generated by shard_stories.py from planning-artifacts/stories.md")
    lines.append("# Source of truth for story lifecycle state.")
    lines.append("# Statuses: backlog, ready-for-dev, in-progress, code-review, done")
    lines.append("")
    lines.append("last_updated: 2026-04-19")
    lines.append("")
    lines.append("development_status:")
    # group by epic with an epic-N marker
    by_epic: dict[int, list[dict]] = {}
    for b in blocks:
        by_epic.setdefault(b["epic"], []).append(b)
    for epic_num in sorted(by_epic.keys()):
        lines.append(f"  epic-{epic_num}: backlog")
        for b in sorted(by_epic[epic_num], key=lambda x: x["story"]):
            lines.append(f"  {b['story_key']}: backlog")
    lines.append("")
    SPRINT_STATUS.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if not STORIES_MD.exists():
        print(f"ERROR: {STORIES_MD} not found", file=sys.stderr)
        return 1
    md = STORIES_MD.read_text(encoding="utf-8")
    blocks = parse_stories(md)
    print(f"Parsed {len(blocks)} stories from {STORIES_MD}")

    # Write each story file
    written = 0
    for b in blocks:
        out = IMPL_DIR / f"{b['story_key']}.md"
        out.write_text(render_story_file(b), encoding="utf-8")
        written += 1
    print(f"Wrote {written} story files under {IMPL_DIR}")

    write_sprint_status(blocks)
    print(f"Wrote sprint status: {SPRINT_STATUS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
