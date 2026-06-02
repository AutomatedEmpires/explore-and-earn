/**
 * Brand chrome at the top of the app shell. Server component — purely
 * presentational, no client state.
 */
export function TopBar() {
	return (
		<header className="shell-topbar">
			<span className="shell-brand">{"Explore&Earn"}</span>
		</header>
	);
}
