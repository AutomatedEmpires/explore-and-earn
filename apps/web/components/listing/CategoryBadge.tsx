import { Icon, type IconKey } from "@explore-and-earn/ui"
import type { MarketplaceCategory } from "@explore-and-earn/contracts"
import styles from "./CategoryBadge.module.css"

const CATEGORY_ICON: Record<MarketplaceCategory, IconKey> = {
	farm: "category.farm",
	maritime: "category.maritime",
	remote: "category.remote",
	seasonal: "category.seasonal",
	mix: "category.mix",
}

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
}

export function CategoryBadge({ category }: { readonly category: MarketplaceCategory }) {
	return (
		<span className={styles.badge} data-category={category}>
			<Icon aria-hidden name={CATEGORY_ICON[category]} size={16} />
			<span>{CATEGORY_LABEL[category]}</span>
		</span>
	)
}
