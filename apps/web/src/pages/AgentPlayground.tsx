import { Navigate, useParams } from 'react-router-dom';
import { PatientDemo } from './PatientDemo.js';

/**
 * Voice + chat for a single published agent (route param).
 */
export function AgentPlayground(): JSX.Element {
  const { id } = useParams();
  if (!id) {
    return <Navigate to="/agents" replace />;
  }
  return <PatientDemo lockedAgentId={id} />;
}
