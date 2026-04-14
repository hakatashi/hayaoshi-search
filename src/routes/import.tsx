import {For, Show, createMemo, createSignal, type Component} from 'solid-js';
import {addDoc, Timestamp} from 'firebase/firestore';
import Papa from 'papaparse';
import {Questions} from '~/lib/firebase';
import type {Question, QuestionInput} from '~/lib/types';
import {buildSearchTokens} from '~/lib/tokenizer';
import styles from './import.module.css';

// Column field options for mapping
const FIELD_OPTIONS = [
	{value: '', label: '（スキップ）'},
	{value: 'question', label: '問題文'},
	{value: 'answer', label: '答え'},
	{value: 'explanation', label: '解説'},
	{value: 'alternativeAnswers', label: '別解（;区切り）'},
	{value: 'majorCategory', label: '大カテゴリ'},
	{value: 'minorCategory', label: '小カテゴリ'},
	{value: 'difficulty', label: '難易度（1-5）'},
	{value: 'source', label: '出典'},
	{value: 'sourceNumber', label: '出典番号'},
];

type ParsedRow = Record<string, string>;

const ImportPage: Component = () => {
	const [rawRows, setRawRows] = createSignal<ParsedRow[]>([]);
	const [headers, setHeaders] = createSignal<string[]>([]);
	const [columnMap, setColumnMap] = createSignal<Record<string, string>>({});
	const [importing, setImporting] = createSignal(false);
	const [progress, setProgress] = createSignal(0);
	const [total, setTotal] = createSignal(0);
	const [error, setError] = createSignal('');
	const [success, setSuccess] = createSignal('');
	const [pasteText, setPasteText] = createSignal('');

	const parseText = (text: string) => {
		if (!text.trim()) return;
		setError('');
		setSuccess('');

		const delimiter = text.includes('\t') ? '\t' : ',';
		const result = Papa.parse<ParsedRow>(text.trim(), {
			delimiter,
			header: true,
			skipEmptyLines: true,
		});

		if (result.errors.length > 0) {
			setError(`パース エラー: ${result.errors[0].message}`);
			return;
		}

		const hdrs = result.meta.fields ?? [];
		setHeaders(hdrs);
		setRawRows(result.data);

		// Auto-map columns by matching header names
		const autoMap: Record<string, string> = {};
		const fieldNames: Record<string, string> = {
			question: '問題文',
			answer: '答え',
			explanation: '解説',
			alternativeAnswers: '別解',
			majorCategory: '大カテゴリ',
			minorCategory: '小カテゴリ',
			difficulty: '難易度',
			source: '出典',
			sourceNumber: '出典番号',
		};
		for (const hdr of hdrs) {
			for (const [field, label] of Object.entries(fieldNames)) {
				if (hdr === label || hdr.toLowerCase() === field.toLowerCase()) {
					autoMap[hdr] = field;
					break;
				}
			}
		}
		setColumnMap(autoMap);
	};

	const handleFile = (file: File) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			setPasteText(text);
			parseText(text);
		};
		reader.readAsText(file, 'UTF-8');
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		const file = e.dataTransfer?.files[0];
		if (file) handleFile(file);
	};

	const handleFileInput = (e: Event) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleFile(file);
	};

	const handlePaste = (text: string) => {
		setPasteText(text);
		if (text.trim()) parseText(text);
		else {
			setRawRows([]);
			setHeaders([]);
		}
	};

	const previewRows = createMemo(() => rawRows().slice(0, 5));

	const buildQuestion = (row: ParsedRow): Partial<QuestionInput> => {
		const map = columnMap();
		const q: Partial<QuestionInput> = {};
		for (const [col, field] of Object.entries(map)) {
			if (!field) continue;
			const val = row[col] ?? '';
			if (field === 'alternativeAnswers') {
				(q as Record<string, unknown>).alternativeAnswers = val
					.split(';')
					.map((s) => s.trim())
					.filter(Boolean);
			} else if (field === 'difficulty') {
				const n = Number(val);
				(q as Record<string, unknown>).difficulty = Number.isNaN(n)
					? 3
					: Math.max(1, Math.min(5, n));
			} else {
				(q as Record<string, unknown>)[field] = val;
			}
		}
		return q;
	};

	const handleImport = async () => {
		const rows = rawRows();
		if (rows.length === 0) return;
		setImporting(true);
		setProgress(0);
		setTotal(rows.length);
		setError('');
		setSuccess('');

		let count = 0;
		for (const row of rows) {
			try {
				const partial = buildQuestion(row);
				const question: QuestionInput = {
					question: (partial.question ?? '').trim(),
					answer: (partial.answer ?? '').trim(),
					explanation: (partial.explanation ?? '').trim(),
					alternativeAnswers: partial.alternativeAnswers ?? [],
					majorCategory: (partial.majorCategory ?? '').trim(),
					minorCategory: (partial.minorCategory ?? '').trim(),
					difficulty: (partial.difficulty as 1 | 2 | 3 | 4 | 5) ?? 3,
					source: (partial.source ?? '').trim(),
					sourceNumber: (partial.sourceNumber ?? '').trim(),
				};

				if (!question.question || !question.answer) {
					count++;
					setProgress(count);
					continue;
				}

				const searchTokens = await buildSearchTokens(
					question.question,
					question.answer,
				);
				await addDoc(Questions, {
					...question,
					searchTokens,
					createdAt: Timestamp.now(),
				} as Question);
			} catch (err) {
				console.error('Import error for row:', err);
			}
			count++;
			setProgress(count);
		}

		setImporting(false);
		setSuccess(`${count} 件のインポートが完了しました。`);
		setRawRows([]);
		setHeaders([]);
		setPasteText('');
	};

	return (
		<div class={styles.container}>
			<div class={styles.header}>
				<h1 class={styles.title}>問題インポート</h1>
				<p class={styles.description}>
					CSV または TSV ファイルから問題を一括でインポートできます。
				</p>
			</div>

			{error() && <div class={styles.errorMsg}>{error()}</div>}
			{success() && <div class={styles.successMsg}>{success()}</div>}

			{/* File upload */}
			<div class={styles.section}>
				<h2 class={styles.sectionTitle}>ファイルをアップロード</h2>
				<label
					class={styles.dropArea}
					onDrop={handleDrop}
					onDragOver={(e) => e.preventDefault()}
				>
					<div class={styles.uploadIcon}>
						<svg
							width="40"
							height="40"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<title>Upload</title>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
							/>
						</svg>
					</div>
					<span class={styles.uploadLabel}>
						<span>クリックしてファイルを選択</span> またはドラッグ&ドロップ
					</span>
					<input
						type="file"
						class={styles.fileInput}
						accept=".csv,.tsv,.txt"
						onChange={handleFileInput}
					/>
					<p>CSV / TSV ファイル対応</p>
				</label>
			</div>

			{/* Paste area */}
			<div class={styles.section}>
				<h2 class={styles.sectionTitle}>テキストを貼り付け</h2>
				<textarea
					class={styles.pasteArea}
					rows={6}
					placeholder="ヘッダー行を含む CSV/TSV テキストを貼り付けてください"
					value={pasteText()}
					onInput={(e) => handlePaste(e.currentTarget.value)}
				/>
			</div>

			{/* Format hint */}
			<div class={styles.section}>
				<div class={styles.formatHint}>
					<h4>フォーマット例（TSV）</h4>
					<p>
						ヘッダー行を含めてください。カラム名: <code>問題文</code>,{' '}
						<code>答え</code>, <code>解説</code>, <code>別解</code>,{' '}
						<code>大カテゴリ</code>, <code>小カテゴリ</code>,{' '}
						<code>難易度</code>, <code>出典</code>, <code>出典番号</code>
					</p>
					<p>
						別解は <code>;</code>（セミコロン）で区切って複数指定できます。
					</p>
				</div>
			</div>

			{/* Column mapping */}
			<Show when={headers().length > 0}>
				<div class={styles.section}>
					<h2 class={styles.sectionTitle}>カラムのマッピング</h2>
					<div class={styles.mappingGrid}>
						<For each={headers()}>
							{(hdr) => (
								<div class={styles.mappingItem}>
									<div class={styles.mappingLabel}>{hdr}</div>
									<select
										class={styles.mappingSelect}
										value={columnMap()[hdr] ?? ''}
										onChange={(e) =>
											setColumnMap((prev) => ({
												...prev,
												[hdr]: e.currentTarget.value,
											}))
										}
									>
										<For each={FIELD_OPTIONS}>
											{(opt) => <option value={opt.value}>{opt.label}</option>}
										</For>
									</select>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Preview */}
			<Show when={previewRows().length > 0}>
				<div class={styles.section}>
					<h2 class={styles.sectionTitle}>
						プレビュー（{rawRows().length} 件中 最初の {previewRows().length}{' '}
						件）
					</h2>
					<div class={styles.previewWrapper}>
						<table class={styles.previewTable}>
							<thead>
								<tr>
									<For each={headers()}>{(hdr) => <th>{hdr}</th>}</For>
								</tr>
							</thead>
							<tbody>
								<For each={previewRows()}>
									{(row) => (
										<tr>
											<For each={headers()}>
												{(hdr) => <td title={row[hdr]}>{row[hdr]}</td>}
											</For>
										</tr>
									)}
								</For>
							</tbody>
						</table>
						<Show when={rawRows().length > 5}>
							<div class={styles.previewMore}>
								他 {rawRows().length - 5} 件...
							</div>
						</Show>
					</div>
				</div>
			</Show>

			{/* Import progress */}
			<Show when={importing()}>
				<div class={styles.section}>
					<div class={styles.progressCard}>
						<p class={styles.progressText}>
							インポート中... {progress()} / {total()} 件
						</p>
						<div class={styles.progressTrack}>
							<div
								class={styles.progressFill}
								style={`width: ${total() ? (progress() / total()) * 100 : 0}%`}
							/>
						</div>
						<p class={styles.progressStatus}>しばらくお待ちください</p>
					</div>
				</div>
			</Show>

			{/* Import button */}
			<Show when={rawRows().length > 0 && !importing()}>
				<button
					type="button"
					class={styles.importBtn}
					onClick={handleImport}
					disabled={importing()}
				>
					{rawRows().length} 件をインポートする
				</button>
			</Show>
		</div>
	);
};

export default ImportPage;
