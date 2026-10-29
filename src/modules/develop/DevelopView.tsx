import { Filmstrip } from '../../components/Filmstrip';
import { DevelopLeftPanel } from './DevelopLeftPanel';
import { DevelopCenter } from './DevelopCenter';
import { DevelopRightPanel } from './DevelopRightPanel';
import layout from '../layout.module.css';

export function DevelopView() {
  return (
    <>
      <div className={layout.row} data-testid="develop-view">
        <DevelopLeftPanel />
        <DevelopCenter />
        <DevelopRightPanel />
      </div>
      <Filmstrip />
    </>
  );
}
