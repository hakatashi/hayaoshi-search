import {type JSX, Suspense} from 'solid-js';
import {A} from '@solidjs/router';
import {signOut} from 'firebase/auth';
import {auth} from '~/lib/firebase';
import {createAuthState} from '~/lib/auth';
import AuthGuard from './AuthGuard';
import styles from './Layout.module.css';

interface Props {
	children?: JSX.Element;
}

export default function Layout(props: Props) {
	const {user} = createAuthState();

	return (
		<AuthGuard>
			<div class={styles.wrapper}>
				<header class={styles.header}>
					<div class={styles.inner}>
						<A href="/" class={styles.logo}>
							早押し問題検索
						</A>
						<nav class={styles.nav}>
							<A href="/" class={styles.navLink} end>
								検索
							</A>
							<A href="/questions/new" class={styles.navLink}>
								問題追加
							</A>
							<A href="/import" class={styles.navLink}>
								インポート
							</A>
							<A href="/quiz" class={styles.navLink}>
								クイズ
							</A>
						</nav>
						<div class={styles.userArea}>
							<span class={styles.userEmail}>{user()?.email}</span>
							<button
								type="button"
								class={styles.signOutBtn}
								onClick={() => signOut(auth)}
							>
								サインアウト
							</button>
						</div>
					</div>
				</header>
				<main class={styles.main}>
					<div class={styles.container}>
						<Suspense
							fallback={
								<div class={styles.loadingPage}>
									<div class={styles.spinner} />
								</div>
							}
						>
							{props.children}
						</Suspense>
					</div>
				</main>
			</div>
		</AuthGuard>
	);
}
