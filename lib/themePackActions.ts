import { premiumAlert } from '../components/PremiumAlert';
import { type Collection } from '../constants/shuffle';
import { toast } from './toast';

// Long-press handler for a user collection row: confirms + performs the
// destructive delete. Extracted verbatim from the Theme Packs screen so the
// screen file stays within the size budget; the two runtime dependencies
// (the collection and the store's delete action) are passed in explicitly so
// the logic is unchanged.
export function confirmDeleteCollection(
  collection: Collection,
  deleteCollection: (id: string) => void,
) {
  premiumAlert({
    title: 'Delete collection',
    message: `Delete "${collection.name}"? Shuffle history is cleared.`,
    icon: 'trash-outline',
    accentColor: '#FF7A6E',
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            deleteCollection(collection.id);
          } catch (e) {
            toast('Failed to delete collection');
            console.warn('[shuffle] delete failed:', e);
          }
        },
      },
    ],
  });
}
