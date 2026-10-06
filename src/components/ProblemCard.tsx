import type { MediaDiagnosis } from '../diagnose';
import { useVideoUi } from '../theme';

/** One diagnosed problem: what is wrong, in plain words, and the steps for THIS browser. */
export function ProblemCard({ diagnosis, action }: { diagnosis: MediaDiagnosis; action?: React.ReactNode }) {
  const { labels } = useVideoUi();
  const steps = labels.fixSteps(diagnosis.problem, diagnosis.device, diagnosis.browser);

  return (
    <div className="ve-problem" role="status">
      <p className="ve-problem__title">{labels.problemTitle(diagnosis.problem, diagnosis.device)}</p>
      <ol className="ve-problem__steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {diagnosis.detail && diagnosis.problem === 'unknown' ? <p className="ve-problem__detail">{diagnosis.detail}</p> : null}
      {action ? <div className="ve-problem__action">{action}</div> : null}
    </div>
  );
}
