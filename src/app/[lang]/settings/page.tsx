import { Shell } from '@/components/layout/Shell';
import { SettingsView } from '@/components/settings/SettingsView';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';

export default function SettingsPage() {
  return (
    <Shell>
      <DirectionalTransition>
        <SettingsView />
      </DirectionalTransition>
    </Shell>
  );
}
