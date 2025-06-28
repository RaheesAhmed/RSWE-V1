import * as vscode from 'vscode';
import { ProjectAnalysis, ProjectFile } from '@/types';
/**
 * SemanticSearchManager - Advanced Code Search with Natural Language
 *
 * Provides semantic code search capabilities:
 * - Natural language queries for finding relevant code
 * - Context-aware search across entire project
 * - Function/class/variable search with semantic understanding
 * - Code pattern matching and similarity search
 */
export declare class SemanticSearchManager {
    private readonly _context;
    private _projectAnalysis;
    private _searchIndex;
    private _isIndexed;
    constructor(context: vscode.ExtensionContext);
    /**
     * Initialize semantic search with project analysis
     */
    initialize(projectAnalysis: ProjectAnalysis): Promise<void>;
    /**
     * Perform semantic search with natural language query
     */
    searchCode(query: string, limit?: number): Promise<SemanticSearchResult[]>;
    /**
     * Find similar code patterns to a given code snippet
     */
    findSimilarCode(codeSnippet: string, limit?: number): Promise<SemanticSearchResult[]>;
    /**
     * Search for functions/classes/variables by name or usage
     */
    searchSymbols(symbolName: string, symbolType?: 'function' | 'class' | 'variable'): Promise<SemanticSearchResult[]>;
    /**
     * Get search suggestions based on project context
     */
    getSearchSuggestions(): string[];
    /**
     * Build searchable index from project files
     */
    private _buildSearchIndex;
    /**
     * Extract searchable items from file content
     */
    private _extractSearchableItems;
    /**
     * Extract JavaScript/TypeScript searchable items
     */
    private _extractJavaScriptItems;
    /**
     * Extract Python searchable items
     */
    private _extractPythonItems;
    /**
     * Extract Java searchable items
     */
    private _extractJavaItems;
    /**
     * Get context lines around a specific line number
     */
    private _getContextLines;
    /**
     * Tokenize search query for better matching
     */
    private _tokenizeQuery;
    /**
     * Calculate relevance score for search results
     */
    private _calculateRelevanceScore;
    /**
     * Calculate code similarity between snippets
     */
    private _calculateCodeSimilarity;
    /**
     * Extract code tokens for similarity comparison
     */
    private _extractCodeTokens;
    /**
     * Calculate symbol relevance score
     */
    private _calculateSymbolRelevance;
    /**
     * Get match reason for search result
     */
    private _getMatchReason;
    /**
     * Update search index when files change
     */
    updateIndex(updatedFiles: ProjectFile[]): Promise<void>;
    /**
     * Get semantic search index status for integration
     */
    getIndexStatus(): {
        isIndexed: boolean;
        indexedFiles: number;
        searchableItems: number;
    };
    /**
     * Dispose resources and cleanup
     */
    dispose(): void;
}
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
export {};
//# sourceMappingURL=SemanticSearchManager.d.ts.map