"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "@explore-and-earn/ui";

import { HOST_FUNNEL_EVENTS, captureEvent } from "../../lib/analytics";
import { useDemoSession } from "./DemoSession";
import {
  DEMO_ANALYTICS_LABEL,
  DEMO_DATA_LABEL,
  DEMO_MOVABLE_STAGES,
  DEMO_STAGE_LABEL,
  DEMO_STAGE_ORDER,
  QUALIFIED_MATCH_THRESHOLD,
  demoRole,
  tallyByStage,
  type DemoApplicant,
  type DemoStage,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The applicant workspace: pipeline board, list mode, and candidate detail.
 *
 * SESSION-LOCAL MOVES ARE THE POINT. A read-only screenshot of a pipeline
 * proves nothing about whether the product is pleasant to use, so a visitor can
 * move a candidate between stages here and watch the column counts, the funnel,
 * the qualified-match tile and the per-role diagnosis all move with them. None
 * of it persists past the tab, and "Reset demo" in the toolbar restores canon.
 *
 * THE COUNTS ARE NOT CACHED. Every number on this surface is a fold over the
 * session's applicant list, computed at render. That is why moving one card
 * cannot leave a stale total behind — there is no total to leave behind.
 *
 * PEOPLE GET INITIALS, NEVER A PHOTOGRAPH. These are invented candidates; the
 * site-photo catalog shows scenes, and dressing a fictional person in a real
 * photographed face is the misrepresentation the photography rule forbids.
 */

/** The four columns that carry the live decision. The rest read as a list. */
const BOARD_COLUMNS: readonly DemoStage[] = [
  "new",
  "reviewing",
  "interview",
  "offer",
];

function CandidateAvatar({
  applicant,
  large,
}: {
  readonly applicant: DemoApplicant;
  readonly large?: boolean;
}) {
  return (
    <span
      className={`${styles.avatar}${large ? ` ${styles.avatarLarge}` : ""}`}
      aria-hidden="true"
    >
      {applicant.initials}
    </span>
  );
}

function ScoreChip({ score }: { readonly score: number }) {
  const qualified = score >= QUALIFIED_MATCH_THRESHOLD;
  return (
    <span
      className={`${styles.scoreChip}${qualified ? ` ${styles.scoreChipQualified}` : ""}`}
    >
      <Icon name="status.match" size={12} aria-hidden />
      {score}
    </span>
  );
}

function CandidateCard({
  applicant,
  onOpen,
}: {
  readonly applicant: DemoApplicant;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={styles.candidate}
      onClick={() => onOpen(applicant.id)}
    >
      <span className={styles.candidateTop}>
        <CandidateAvatar applicant={applicant} />
        <span>
          <span className={styles.candidateName}>{applicant.name}</span>
          <span className={styles.candidateMeta}>{applicant.location}</span>
        </span>
        <ScoreChip score={applicant.matchScore} />
      </span>
      <span className={styles.candidateMeta}>
        {applicant.experience} · applied {applicant.appliedDaysAgo}d ago
      </span>
    </button>
  );
}

export function DemoApplicantWorkspace({ id }: { readonly id?: string }) {
  const session = useDemoSession();
  const [mode, setMode] = useState<"board" | "list">("board");
  const [openId, setOpenId] = useState<string | null>(null);

  const applicants = session.applicants;
  const tally = useMemo(() => tallyByStage(applicants), [applicants]);
  const open = useMemo(
    () => applicants.find((applicant) => applicant.id === openId) ?? null,
    [applicants, openId],
  );

  const openCandidate = useCallback((candidateId: string) => {
    setOpenId(candidateId);
    captureEvent(HOST_FUNNEL_EVENTS.demoCandidateOpened, {
      candidate: candidateId,
    });
  }, []);

  return (
    <div id={id}>
      <div className={styles.modeRow}>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === "board"}
          onClick={() => setMode("board")}
        >
          <Icon name="nav.dashboard" size={16} aria-hidden />
          Pipeline
        </button>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === "list"}
          onClick={() => setMode("list")}
        >
          <Icon name="action.sort" size={16} aria-hidden />
          List — all {applicants.length}
        </button>
        <span className={styles.toolbarSpacer} />
        <DemoLabel text={DEMO_DATA_LABEL} />
      </div>

      {mode === "board" ? (
        <div className={styles.board}>
          {BOARD_COLUMNS.map((stage) => {
            const column = applicants.filter(
              (applicant) => applicant.stage === stage,
            );
            return (
              <section key={stage} className={styles.column}>
                <div className={styles.columnHead}>
                  <h3 className={styles.columnTitle}>
                    {DEMO_STAGE_LABEL[stage]}
                  </h3>
                  <span className={styles.columnCount}>{column.length}</span>
                </div>
                <div className={styles.columnScroll}>
                  {column.map((applicant) => (
                    <CandidateCard
                      key={applicant.id}
                      applicant={applicant}
                      onOpen={openCandidate}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className={styles.listWrap}>
          <table className={styles.listTable}>
            <caption className={styles.srOnly}>
              All {applicants.length} applications, with stage, role, match
              score and availability.
            </caption>
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Role</th>
                <th scope="col">Stage</th>
                <th scope="col">Match</th>
                <th scope="col">Available</th>
                <th scope="col">Housing</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((applicant) => (
                <tr key={applicant.id}>
                  <td className={styles.listNameCell}>
                    <button
                      type="button"
                      className={styles.listLink}
                      onClick={() => openCandidate(applicant.id)}
                    >
                      {applicant.name}
                    </button>
                    <span className={styles.candidateMeta}>
                      {" "}
                      · {applicant.location}
                    </span>
                  </td>
                  <td>{demoRole(applicant.roleId).title}</td>
                  <td>{DEMO_STAGE_LABEL[applicant.stage]}</td>
                  <td className={styles.numeric}>{applicant.matchScore}</td>
                  <td>{applicant.availability}</td>
                  <td>{applicant.needsHousing ? "Needs housing" : "Local"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage totals — folded from the same list the board renders. */}
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h3 className={styles.panelTitle}>Every stage, every application</h3>
            <p className={styles.panelNote}>
              These totals are computed from the {applicants.length} application
              records on this page. Move somebody and they move with them.
            </p>
          </div>
          <DemoLabel text={DEMO_ANALYTICS_LABEL} />
        </div>
        <ul className={styles.funnelList}>
          {DEMO_STAGE_ORDER.map((stage) => (
            <li key={stage} className={styles.funnelRow}>
              <span>{DEMO_STAGE_LABEL[stage]}</span>
              <span
                className={styles.track}
                role="img"
                aria-label={`${DEMO_STAGE_LABEL[stage]}: ${tally[stage]} of ${applicants.length}`}
              >
                <span
                  className={styles.trackFill}
                  style={
                    {
                      "--fill": `${Math.round((tally[stage] / Math.max(1, applicants.length)) * 100)}%`,
                    } as React.CSSProperties
                  }
                />
              </span>
              <span className={styles.funnelValue}>{tally[stage]}</span>
            </li>
          ))}
        </ul>
      </div>

      {open ? (
        <CandidateDetail
          applicant={open}
          onClose={() => setOpenId(null)}
          onMove={session.moveStage}
        />
      ) : (
        <div className={styles.callout}>
          <p className={styles.calloutTitle}>Open anyone above</p>
          <p className={styles.calloutBody}>
            The detail view carries their availability, certifications, housing
            need and the stage control. Moving a candidate changes only this
            browser tab.
          </p>
        </div>
      )}
    </div>
  );
}

function CandidateDetail({
  applicant,
  onClose,
  onMove,
}: {
  readonly applicant: DemoApplicant;
  readonly onClose: () => void;
  readonly onMove: (id: string, stage: DemoStage) => void;
}) {
  const role = demoRole(applicant.roleId);

  return (
    <section className={styles.detailPanel} aria-label="Candidate detail">
      <div className={styles.detailHead}>
        <CandidateAvatar applicant={applicant} large />
        <div>
          <h3 className={styles.panelTitle}>{applicant.name}</h3>
          <p className={styles.panelNote}>
            {applicant.location} · applied {applicant.appliedOn} ·{" "}
            {role.title}
          </p>
        </div>
        <span className={styles.toolbarSpacer} />
        <ScoreChip score={applicant.matchScore} />
        <button
          type="button"
          className={styles.resetButton}
          onClick={onClose}
          aria-label="Close candidate detail"
        >
          <Icon name="action.close" size={16} aria-hidden />
        </button>
      </div>

      <ul className={styles.factGrid}>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Availability</span>
          <span className={styles.factValue}>{applicant.availability}</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Experience</span>
          <span className={styles.factValue}>{applicant.experience}</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Certifications</span>
          <span className={styles.factValue}>
            {applicant.certifications.length > 0
              ? applicant.certifications.join(", ")
              : "None recorded"}
          </span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Housing</span>
          <span className={styles.factValue}>
            {applicant.needsHousing
              ? "Needs the staff cabin"
              : "Local — no housing needed"}
          </span>
        </li>
      </ul>

      <p className={styles.panelNote}>{applicant.note}</p>

      <div>
        <h4 className={styles.includedTitle}>Move to</h4>
        <div className={styles.stageSelect} role="group" aria-label="Stage">
          {DEMO_MOVABLE_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              className={styles.stageOption}
              aria-pressed={applicant.stage === stage}
              onClick={() => onMove(applicant.id, stage)}
            >
              {DEMO_STAGE_LABEL[stage]}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.panelNote}>
        The match score was computed when the application was made and is stored
        with it — moving somebody between stages never recomputes it, because a
        score that moves to flatter a decision is not evidence.
      </p>

      <DemoLabel text={applicant.demoLabel} />
    </section>
  );
}
