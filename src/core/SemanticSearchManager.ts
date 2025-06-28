import * as vscode from 'vscode';
import * as fs from 'fs/promises';

import {
	ProjectAnalysis,
	ProjectFile,
	RSWEError
} from '@/types';

/**
 * SemanticSearchManager - Advanced Code Search with Natural Language
 * 
 * Provides semantic code search capabilities:
 * - Natural language queries for finding relevant code
 * - Context-aware search across entire project
 * - Function/class/variable search with semantic understanding
 * - Code pattern matching and similarity search
 */
export class SemanticSearchManager {
	private _context: vscode.ExtensionContext;;
	private _projectAnalysis: ProjectAnalysis | null = null;
	private _searchIndex: Map<string, SearchableCodeItem[]> = new Map();
	private _isIndexed = false;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
	}

	/**
	 * Initialize semantic search with project analysis
	 */
	public async initialize(projectAnalysis: ProjectAnalysis): Promise<void> {
		try {
			console.log('🔍 SemanticSearchManager: Initializing semantic search...');
			this._projectAnalysis = projectAnalysis;
			
			// Build searchable index from project files
			await this._buildSearchIndex();
			
			this._isIndexed = true;
			console.log(`✅ SemanticSearchManager: Indexed ${this._searchIndex.size} searchable items`);
		} catch (error) {
			console.error('❌ SemanticSearchManager: Failed to initialize:', error);
			throw new RSWEError('Failed to initialize semantic search', 'SEARCH_INIT_ERROR', { error });
		}
	}

	/**
	 * Perform semantic search with natural language query
	 */
	public async searchCode(query: string, limit: number = 10): Promise<SemanticSearchResult[]> {
		if (!this._isIndexed || !this._projectAnalysis) {
			throw new RSWEError('Semantic search not initialized', 'SEARCH_NOT_INITIALIZED');
		}

		try {
			console.log(`🔎 SemanticSearchManager: Searching for "${query}"`);
			
			const results: SemanticSearchResult[] = [];
			const queryLower = query.toLowerCase();
			const queryTokens = this._tokenizeQuery(queryLower);

			// Search across all indexed items
			for (const [filePath, items] of this._searchIndex.entries()) {
				for (const item of items) {
					const relevanceScore = this._calculateRelevanceScore(item, queryTokens, queryLower);
					
					if (relevanceScore > 0.3) { // Minimum relevance threshold
						results.push({
							file: filePath,
							item: item,
							relevanceScore: relevanceScore,
							matchReason: this._getMatchReason(item, queryTokens, queryLower)
						});
					}
				}
			}

			// Sort by relevance score and limit results
			const sortedResults = results
				.sort((a, b) => b.relevanceScore - a.relevanceScore)
				.slice(0, limit);

			console.log(`📊 SemanticSearchManager: Found ${sortedResults.length} relevant results`);
			return sortedResults;

		} catch (error) {
			console.error('❌ SemanticSearchManager: Search failed:', error);
			throw new RSWEError('Semantic search failed', 'SEARCH_ERROR', { error, query });
		}
	}

	/**
	 * Find similar code patterns to a given code snippet
	 */
	public async findSimilarCode(codeSnippet: string, limit: number = 5): Promise<SemanticSearchResult[]> {
		if (!this._isIndexed) {
			throw new RSWEError('Semantic search not initialized', 'SEARCH_NOT_INITIALIZED');
		}

		try {
			const results: SemanticSearchResult[] = [];
			const snippetTokens = this._extractCodeTokens(codeSnippet);
			
			for (const [filePath, items] of this._searchIndex.entries()) {
				for (const item of items) {
					const similarity = this._calculateCodeSimilarity(snippetTokens, item.content);
					
					if (similarity > 0.4) { // Minimum similarity threshold
						results.push({
							file: filePath,
							item: item,
							relevanceScore: similarity,
							matchReason: `Similar code pattern (${(similarity * 100).toFixed(1)}% match)`
						});
					}
				}
			}

			return results
				.sort((a, b) => b.relevanceScore - a.relevanceScore)
				.slice(0, limit);

		} catch (error) {
			console.error('❌ SemanticSearchManager: Similar code search failed:', error);
			throw new RSWEError('Similar code search failed', 'SIMILARITY_SEARCH_ERROR', { error });
		}
	}

	/**
	 * Search for functions/classes/variables by name or usage
	 */
	public async searchSymbols(symbolName: string, symbolType?: 'function' | 'class' | 'variable'): Promise<SemanticSearchResult[]> {
		if (!this._isIndexed) {
			throw new RSWEError('Semantic search not initialized', 'SEARCH_NOT_INITIALIZED');
		}

		const results: SemanticSearchResult[] = [];
		const symbolLower = symbolName.toLowerCase();

		for (const [filePath, items] of this._searchIndex.entries()) {
			for (const item of items) {
				// Check if symbol matches the search criteria
				if (symbolType && item.type !== symbolType) continue;
				
				if (item.name.toLowerCase().includes(symbolLower) || 
					item.content.toLowerCase().includes(symbolLower)) {
					
					const score = this._calculateSymbolRelevance(item, symbolName);
					results.push({
						file: filePath,
						item: item,
						relevanceScore: score,
						matchReason: `Symbol match: ${item.name} (${item.type})`
					});
				}
			}
		}

		return results
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, 20);
	}

	/**
	 * Get search suggestions based on project context
	 */
	public getSearchSuggestions(): string[] {
		if (!this._projectAnalysis) return [];

		const suggestions: string[] = [];
		
		// Add language-specific suggestions
		const languages = Object.keys(this._projectAnalysis.metrics.languages);
		if (languages.includes('TypeScript') || languages.includes('JavaScript')) {
			suggestions.push(
				"Find React components",
				"Show API endpoints", 
				"Find async functions",
				"Show error handling patterns",
				"Find database queries"
			);
		}

		if (languages.includes('Python')) {
			suggestions.push(
				"Find class definitions",
				"Show import statements",
				"Find exception handling",
				"Show function decorators"
			);
		}

		// Add project-specific suggestions based on dependencies
		const deps = Array.from(this._projectAnalysis.dependencies.keys());
		if (deps.some(d => d.includes('react'))) {
			suggestions.push("Find React hooks", "Show component props", "Find state management");
		}

		return suggestions.slice(0, 8);
	}

	/**
	 * Build searchable index from project files
	 */
	private async _buildSearchIndex(): Promise<void> {
		if (!this._projectAnalysis) return;

		this._searchIndex.clear();

		for (const file of this._projectAnalysis.files) {
			try {
				const content = await fs.readFile(file.path, 'utf-8');
				const searchableItems = await this._extractSearchableItems(file, content);
				
				if (searchableItems.length > 0) {
					this._searchIndex.set(file.relativePath, searchableItems);
				}
			} catch (error) {
				console.warn(`Failed to index file ${file.path}:`, error);
			}
		}
	}

	/**
	 * Extract searchable items from file content
	 */
	private async _extractSearchableItems(file: ProjectFile, content: string): Promise<SearchableCodeItem[]> {
		const items: SearchableCodeItem[] = [];
		const lines = content.split('\n');

		// Language-specific extraction
		if (file.extension === '.ts' || file.extension === '.js' || file.extension === '.tsx' || file.extension === '.jsx') {
			items.push(...this._extractJavaScriptItems(content, lines));
		} else if (file.extension === '.py') {
			items.push(...this._extractPythonItems(content, lines));
		} else if (file.extension === '.java') {
			items.push(...this._extractJavaItems(content, lines));
		}

		return items;
	}

	/**
	 * Extract JavaScript/TypeScript searchable items
	 */
	private _extractJavaScriptItems(content: string, lines: string[]): SearchableCodeItem[] {
		const items: SearchableCodeItem[] = [];

		// Extract functions
		const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g;
		let match;
		while ((match = functionRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'function',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 5),
				keywords: [match[1], 'function', 'method'],
				signature: match[0]
			});
		}

		// Extract classes
		const classRegex = /(?:export\s+)?class\s+([a-zA-Z_$][\w$]*)/g;
		while ((match = classRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'class',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 7),
				keywords: [match[1], 'class', 'component'],
				signature: match[0]
			});
		}

		// Extract arrow functions
		const arrowFunctionRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
		while ((match = arrowFunctionRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'function',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 3),
				keywords: [match[1], 'arrow', 'function'],
				signature: match[0]
			});
		}

		return items;
	}

	/**
	 * Extract Python searchable items
	 */
	private _extractPythonItems(content: string, lines: string[]): SearchableCodeItem[] {
		const items: SearchableCodeItem[] = [];

		// Extract functions
		const functionRegex = /def\s+([a-zA-Z_][\w]*)\s*\(/g;
		let match;
		while ((match = functionRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'function',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 5),
				keywords: [match[1], 'function', 'def'],
				signature: match[0]
			});
		}

		// Extract classes
		const classRegex = /class\s+([a-zA-Z_][\w]*)/g;
		while ((match = classRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'class',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 7),
				keywords: [match[1], 'class'],
				signature: match[0]
			});
		}

		return items;
	}

	/**
	 * Extract Java searchable items
	 */
	private _extractJavaItems(content: string, lines: string[]): SearchableCodeItem[] {
		const items: SearchableCodeItem[] = [];

		// Extract methods
		const methodRegex = /(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*\w+\s+([a-zA-Z_][\w]*)\s*\(/g;
		let match;
		while ((match = methodRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'function',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 5),
				keywords: [match[1], 'method'],
				signature: match[0]
			});
		}

		// Extract classes
		const classRegex = /(?:public|private)?\s*class\s+([a-zA-Z_][\w]*)/g;
		while ((match = classRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split('\n').length;
			items.push({
				name: match[1],
				type: 'class',
				lineNumber: lineNumber,
				content: this._getContextLines(lines, lineNumber - 1, 7),
				keywords: [match[1], 'class'],
				signature: match[0]
			});
		}

		return items;
	}

	/**
	 * Get context lines around a specific line number
	 */
	private _getContextLines(lines: string[], startLine: number, contextSize: number): string {
		const start = Math.max(0, startLine - Math.floor(contextSize / 2));
		const end = Math.min(lines.length, startLine + Math.ceil(contextSize / 2));
		return lines.slice(start, end).join('\n');
	}

	/**
	 * Tokenize search query for better matching
	 */
	private _tokenizeQuery(query: string): string[] {
		return query
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter(token => token.length > 2);
	}

	/**
	 * Calculate relevance score for search results
	 */
	private _calculateRelevanceScore(item: SearchableCodeItem, queryTokens: string[], originalQuery: string): number {
		let score = 0;

		// Exact name match gets highest score
		if (item.name.toLowerCase() === originalQuery) {
			score += 1.0;
		} else if (item.name.toLowerCase().includes(originalQuery)) {
			score += 0.8;
		}

		// Token matching in name
		for (const token of queryTokens) {
			if (item.name.toLowerCase().includes(token)) {
				score += 0.3;
			}
		}

		// Keyword matching
		for (const keyword of item.keywords) {
			for (const token of queryTokens) {
				if (keyword.toLowerCase().includes(token)) {
					score += 0.2;
				}
			}
		}

		// Content matching
		const contentLower = item.content.toLowerCase();
		for (const token of queryTokens) {
			if (contentLower.includes(token)) {
				score += 0.1;
			}
		}

		return Math.min(score, 1.0);
	}

	/**
	 * Calculate code similarity between snippets
	 */
	private _calculateCodeSimilarity(tokens1: string[], content2: string): number {
		const tokens2 = this._extractCodeTokens(content2);
		const intersection = tokens1.filter(token => tokens2.includes(token));
		const union = [...new Set([...tokens1, ...tokens2])];
		
		return union.length > 0 ? intersection.length / union.length : 0;
	}

	/**
	 * Extract code tokens for similarity comparison
	 */
	private _extractCodeTokens(code: string): string[] {
		return code
			.replace(/[{}();,."'`]/g, ' ')
			.split(/\s+/)
			.filter(token => token.length > 2)
			.map(token => token.toLowerCase());
	}

	/**
	 * Calculate symbol relevance score
	 */
	private _calculateSymbolRelevance(item: SearchableCodeItem, symbolName: string): number {
		let score = 0;
		const symbolLower = symbolName.toLowerCase();
		const itemNameLower = item.name.toLowerCase();

		if (itemNameLower === symbolLower) {
			score = 1.0;
		} else if (itemNameLower.includes(symbolLower)) {
			score = 0.8;
		} else if (item.content.toLowerCase().includes(symbolLower)) {
			score = 0.6;
		}

		return score;
	}

	/**
	 * Get match reason for search result
	 */
	private _getMatchReason(item: SearchableCodeItem, queryTokens: string[], originalQuery: string): string {
		if (item.name.toLowerCase() === originalQuery) {
			return `Exact name match: ${item.name}`;
		}
		
		if (item.name.toLowerCase().includes(originalQuery)) {
			return `Name contains: ${originalQuery}`;
		}

		const matchingTokens = queryTokens.filter(token => item.name.toLowerCase().includes(token));
		if (matchingTokens.length > 0) {
			return `Name matches: ${matchingTokens.join(', ')}`;
		}

		return `Content relevance match`;
	}

	/**
	 * Update search index when files change
	 */
	public async updateIndex(updatedFiles: ProjectFile[]): Promise<void> {
		if (!this._isIndexed) return;

		for (const file of updatedFiles) {
			try {
				const content = await fs.readFile(file.path, 'utf-8');
				const searchableItems = await this._extractSearchableItems(file, content);
				
				if (searchableItems.length > 0) {
					this._searchIndex.set(file.relativePath, searchableItems);
				} else {
					this._searchIndex.delete(file.relativePath);
				}
			} catch (error) {
				console.warn(`Failed to update index for ${file.path}:`, error);
				this._searchIndex.delete(file.relativePath);
			}
		}
	}

	/**
	 * Dispose resources and cleanup
	 */
	public dispose(): void {
		this._searchIndex.clear();
		this._isIndexed = false;
		console.log('🔌 SemanticSearchManager: Disposed and cleaned up');
	}
}

// Types for semantic search
interface SearchableCodeItem {
	name: string;
	type: 'function' | 'class' | 'variable';
	lineNumber: number;
	content: string;
	keywords: string[];
	signature: string;
}

export interface SemanticSearchResult {
	file: string;
	item: SearchableCodeItem;
	relevanceScore: number;
	matchReason: string;
}
