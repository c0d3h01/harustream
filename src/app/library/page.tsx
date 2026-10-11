import { Shell } from '@/components/layout/Shell';
import { LibraryView } from '@/components/library/LibraryView';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';

export default function LibraryPage() {
  return (
    <Shell>
      <DirectionalTransition>
        <LibraryView />
      </DirectionalTransition>
    </Shell>
  );
}
