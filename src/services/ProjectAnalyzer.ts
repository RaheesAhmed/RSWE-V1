import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import ignore from 'ignore';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

export interface FileInfo {
    uri: vscode.Uri;
    relativePath: string;
    language: string;
    size: number;
    lastModified: Date;
    dependencies: string[];
    exports: string[];
    functions: string[];
    classes: string[];
    complexity: number;
}

export interface ProjectStructure {
    rootPath: string;
    files: FileInfo[];
    dependencies: Record<string, string[]>;
    frameworks: string[];
    languages: string[];
    patterns: string[];
    metrics: ProjectMetrics;
}

export interface ProjectMetrics {
    totalFiles: number;
    totalLines: number;
    codeFiles: number;
    testFiles: number;
    configFiles: number;
    averageComplexity: number;
    dependencyDepth: number;
}

/**
 * Project Analysis Service
 * Analyzes project structure, dependencies, and code patterns
 */
export class ProjectAnalyzer implements vscode.Disposable {
    private projectStructure: ProjectStructure | undefined;
    private context: vscode.ExtensionContext | undefined;
    private isInitialized = false;

    /**
     * Initialize the project analyzer
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            Logger.info('🔍 Initializing Project Analyzer...');
            this.context = context;
            this.isInitialized = true;
            Logger.info('✅ Project Analyzer initialized successfully');

        } catch (error) {
            Logger.error('❌ Failed to initialize Project Analyzer', error);
            throw error;
        }
    }

    /**
     * Analyze the entire workspace
     */
    async analyzeWorkspace(workspaceUri: vscode.Uri): Promise<ProjectStructure> {
        if (!this.isInitialized) {
            throw new Error('ProjectAnalyzer not initialized');
        }

        try {
            Logger.info('🔍 Starting workspace analysis...');

            const rootPath = workspaceUri.fsPath;
            const maxFiles = ConfigManager.get('context.maxFiles', 10000);
            const maxDepth = ConfigManager.get('context.indexingDepth', 5);

            // Get all files in workspace
            const files = await this.scanFiles(rootPath, maxFiles, maxDepth);
            
            // Analyze each file
            const fileInfos: FileInfo[] = [];
            for (const file of files) {
                try {
                    const fileInfo = await this.analyzeFile(file);
                    if (fileInfo) {
                        fileInfos.push(fileInfo);
                    }
                } catch (error) {
                    Logger.warn(`Failed to analyze file ${file}`, error);
                }
            }

            // Build dependency graph
            const dependencies = this.buildDependencyGraph(fileInfos);

            // Detect frameworks and patterns
            const frameworks = await this.detectFrameworks(rootPath);
            const patterns = this.detectPatterns(fileInfos);
            const languages = this.getLanguages(fileInfos);

            // Calculate metrics
            const metrics = this.calculateMetrics(fileInfos, dependencies);

            this.projectStructure = {
                rootPath,
                files: fileInfos,
                dependencies,
                frameworks,
                languages,
                patterns,
                metrics
            };

            Logger.info(`✅ Workspace analysis completed: ${fileInfos.length} files analyzed`);
            return this.projectStructure;

        } catch (error) {
            Logger.error('❌ Workspace analysis failed', error);
            throw error;
        }
    }

    /**
     * Get current project structure
     */
    getProjectStructure(): ProjectStructure | undefined {
        return this.projectStructure;
    }

    /**
     * Get files matching a pattern
     */
    getFilesByPattern(pattern: string): FileInfo[] {
        if (!this.projectStructure) {
            return [];
        }

        const regex = new RegExp(pattern, 'i');
        return this.projectStructure.files.filter(file => 
            regex.test(file.relativePath) || regex.test(file.language)
        );
    }

    /**
     * Get dependencies for a specific file
     */
    getFileDependencies(filePath: string): string[] {
        if (!this.projectStructure) {
            return [];
        }

        const normalizedPath = this.normalizePath(filePath);
        return this.projectStructure.dependencies[normalizedPath] || [];
    }

    /**
     * Get files that depend on a specific file
     */
    getFileReverseDependencies(filePath: string): string[] {
        if (!this.projectStructure) {
            return [];
        }

        const normalizedPath = this.normalizePath(filePath);
        const reverseDeps: string[] = [];

        for (const [file, deps] of Object.entries(this.projectStructure.dependencies)) {
            if (deps.includes(normalizedPath)) {
                reverseDeps.push(file);
            }
        }

        return reverseDeps;
    }

    /**
     * Scan files in workspace
     */
    private async scanFiles(rootPath: string, maxFiles: number, maxDepth: number): Promise<string[]> {
        try {
            // Read .gitignore and create ignore filter
            const ig = ignore();
            const gitignorePath = path.join(rootPath, '.gitignore');
            
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                ig.add(gitignoreContent);
            }

            // Add common ignore patterns
            ig.add([
                'node_modules/**',
                '.git/**',
                'dist/**',
                'build/**',
                'out/**',
                '*.log',
                '.vscode/**',
                '.vs/**',
                'coverage/**',
                '__pycache__/**',
                '*.pyc',
                '.pytest_cache/**',
                'target/**',
                'bin/**',
                'obj/**'
            ]);

            // Scan files
            const pattern = path.join(rootPath, `**/*`).replace(/\\/g, '/');
            const files = await glob(pattern, {
                ignore: ['**/node_modules/**', '**/.git/**'],
                nodir: true,
                maxDepth: maxDepth
            });

            // Filter through ignore rules and limit count
            const filteredFiles = files
                .filter(file => {
                    const relativePath = path.relative(rootPath, file);
                    return !ig.ignores(relativePath);
                })
                .filter(file => this.isAnalyzableFile(file))
                .slice(0, maxFiles);

            Logger.info(`📁 Found ${filteredFiles.length} files to analyze`);
            return filteredFiles;

        } catch (error) {
            Logger.error('❌ File scanning failed', error);
            throw error;
        }
    }

    /**
     * Check if file should be analyzed
     */
    private isAnalyzableFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        
        // Code file extensions
        const codeExtensions = [
            '.ts', '.js', '.tsx', '.jsx', '.vue',
            '.py', '.java', '.cs', '.cpp', '.c', '.h',
            '.go', '.rs', '.php', '.rb', '.swift',
            '.kt', '.scala', '.clj', '.hs', '.ml',
            '.dart', '.r', '.sql', '.html', '.css',
            '.scss', '.sass', '.less', '.json', '.xml',
            '.yaml', '.yml', '.toml', '.ini', '.cfg'
        ];

        return codeExtensions.includes(ext);
    }

    /**
     * Analyze individual file
     */
    private async analyzeFile(filePath: string): Promise<FileInfo | null> {
        try {
            const uri = vscode.Uri.file(filePath);
            const stats = fs.statSync(filePath);
            
            if (stats.size > 1024 * 1024) { // Skip files larger than 1MB
                return null;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = vscode.workspace.asRelativePath(uri);
            const language = this.detectLanguage(filePath);

            // Analyze code structure
            const dependencies = this.extractDependencies(content, language);
            const exports = this.extractExports(content, language);
            const functions = this.extractFunctions(content, language);
            const classes = this.extractClasses(content, language);
            const complexity = this.calculateComplexity(content, language);

            return {
                uri,
                relativePath,
                language,
                size: stats.size,
                lastModified: stats.mtime,
                dependencies,
                exports,
                functions,
                classes,
                complexity
            };

        } catch (error) {
            Logger.warn(`Failed to analyze file ${filePath}`, error);
            return null;
        }
    }

    /**
     * Detect programming language
     */
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.js': 'javascript',
            '.tsx': 'typescript',
            '.jsx': 'javascript',
            '.vue': 'vue',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.json': 'json',
            '.xml': 'xml',
            '.yaml': 'yaml',
            '.yml': 'yaml'
        };

        return languageMap[ext] || 'unknown';
    }

    /**
     * Extract import/require dependencies
     */
    private extractDependencies(content: string, language: string): string[] {
        const dependencies: string[] = [];

        try {
            switch (language) {
                case 'typescript':
                case 'javascript':
                    // import statements
                    const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
                    let importMatch;
                    while ((importMatch = importRegex.exec(content)) !== null) {
                        dependencies.push(importMatch[1]);
                    }

                    // require statements
                    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
                    let requireMatch;
                    while ((requireMatch = requireRegex.exec(content)) !== null) {
                        dependencies.push(requireMatch[1]);
                    }
                    break;

                case 'python':
                    // import statements
                    const pyImportRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
                    let pyMatch;
                    while ((pyMatch = pyImportRegex.exec(content)) !== null) {
                        if (pyMatch[1]) {
                            dependencies.push(pyMatch[1]);
                        }
                    }
                    break;

                case 'java':
                    // import statements
                    const javaImportRegex = /import\s+(?:static\s+)?([^;]+);/g;
                    let javaMatch;
                    while ((javaMatch = javaImportRegex.exec(content)) !== null) {
                        dependencies.push(javaMatch[1]);
                    }
                    break;
            }
        } catch (error) {
            Logger.warn('Failed to extract dependencies', error);
        }

        return [...new Set(dependencies)]; // Remove duplicates
    }

    /**
     * Extract exported functions/classes
     */
    private extractExports(content: string, language: string): string[] {
        const exports: string[] = [];

        try {
            switch (language) {
                case 'typescript':
                case 'javascript':
                    // export statements
                    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
                    let exportMatch;
                    while ((exportMatch = exportRegex.exec(content)) !== null) {
                        exports.push(exportMatch[1]);
                    }
                    break;

                case 'python':
                    // Look for functions and classes at module level
                    const pyExportRegex = /^(?:def|class)\s+(\w+)/gm;
                    let pyMatch;
                    while ((pyMatch = pyExportRegex.exec(content)) !== null) {
                        exports.push(pyMatch[1]);
                    }
                    break;
            }
        } catch (error) {
            Logger.warn('Failed to extract exports', error);
        }

        return [...new Set(exports)];
    }

    /**
     * Extract function names
     */
    private extractFunctions(content: string, language: string): string[] {
        const functions: string[] = [];

        try {
            switch (language) {
                case 'typescript':
                case 'javascript':
                    const funcRegex = /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g;
                    let funcMatch;
                    while ((funcMatch = funcRegex.exec(content)) !== null) {
                        functions.push(funcMatch[1] || funcMatch[2]);
                    }
                    break;

                case 'python':
                    const pyFuncRegex = /def\s+(\w+)/g;
                    let pyMatch;
                    while ((pyMatch = pyFuncRegex.exec(content)) !== null) {
                        functions.push(pyMatch[1]);
                    }
                    break;
            }
        } catch (error) {
            Logger.warn('Failed to extract functions', error);
        }

        return [...new Set(functions)];
    }

    /**
     * Extract class names
     */
    private extractClasses(content: string, language: string): string[] {
        const classes: string[] = [];

        try {
            switch (language) {
                case 'typescript':
                case 'javascript':
                    const classRegex = /class\s+(\w+)/g;
                    let classMatch;
                    while ((classMatch = classRegex.exec(content)) !== null) {
                        classes.push(classMatch[1]);
                    }
                    break;

                case 'python':
                    const pyClassRegex = /class\s+(\w+)/g;
                    let pyMatch;
                    while ((pyMatch = pyClassRegex.exec(content)) !== null) {
                        classes.push(pyMatch[1]);
                    }
                    break;
            }
        } catch (error) {
            Logger.warn('Failed to extract classes', error);
        }

        return [...new Set(classes)];
    }

    /**
     * Calculate cyclomatic complexity (simplified)
     */
    private calculateComplexity(content: string, language: string): number {
        let complexity = 1; // Base complexity

        try {
            // Count decision points
            const decisionPatterns = [
                /\bif\b/g,
                /\belse\b/g,
                /\bwhile\b/g,
                /\bfor\b/g,
                /\bswitch\b/g,
                /\bcase\b/g,
                /\bcatch\b/g,
                /\b\?\s*:/g, // ternary operator
                /\b&&\b/g,
                /\b\|\|\b/g
            ];

            for (const pattern of decisionPatterns) {
                const matches = content.match(pattern);
                if (matches) {
                    complexity += matches.length;
                }
            }
        } catch (error) {
            Logger.warn('Failed to calculate complexity', error);
        }

        return complexity;
    }

    /**
     * Build dependency graph
     */
    private buildDependencyGraph(files: FileInfo[]): Record<string, string[]> {
        const dependencies: Record<string, string[]> = {};

        for (const file of files) {
            const filePath = this.normalizePath(file.relativePath);
            dependencies[filePath] = file.dependencies;
        }

        return dependencies;
    }

    /**
     * Detect frameworks and libraries
     */
    private async detectFrameworks(rootPath: string): Promise<string[]> {
        const frameworks: Set<string> = new Set();

        try {
            // Check package.json
            const packageJsonPath = path.join(rootPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

                // Common framework detection
                const frameworkMap: Record<string, string> = {
                    'react': 'React',
                    'vue': 'Vue.js',
                    'angular': 'Angular',
                    'next': 'Next.js',
                    'nuxt': 'Nuxt.js',
                    'express': 'Express.js',
                    'fastify': 'Fastify',
                    'nestjs': 'NestJS',
                    'typescript': 'TypeScript',
                    'jest': 'Jest',
                    'mocha': 'Mocha',
                    'webpack': 'Webpack',
                    'vite': 'Vite',
                    'tailwindcss': 'Tailwind CSS'
                };

                for (const [dep, framework] of Object.entries(frameworkMap)) {
                    if (allDeps && Object.keys(allDeps).some(key => key.includes(dep))) {
                        frameworks.add(framework);
                    }
                }
            }

            // Check for other config files
            const configFiles = [
                { file: 'tsconfig.json', framework: 'TypeScript' },
                { file: 'angular.json', framework: 'Angular' },
                { file: 'vue.config.js', framework: 'Vue.js' },
                { file: 'next.config.js', framework: 'Next.js' },
                { file: 'nuxt.config.js', framework: 'Nuxt.js' },
                { file: 'webpack.config.js', framework: 'Webpack' },
                { file: 'vite.config.js', framework: 'Vite' },
                { file: 'tailwind.config.js', framework: 'Tailwind CSS' },
                { file: 'requirements.txt', framework: 'Python' },
                { file: 'Pipfile', framework: 'Python/Pipenv' },
                { file: 'pom.xml', framework: 'Maven/Java' },
                { file: 'build.gradle', framework: 'Gradle/Java' },
                { file: 'Cargo.toml', framework: 'Rust/Cargo' },
                { file: 'go.mod', framework: 'Go Modules' }
            ];

            for (const { file, framework } of configFiles) {
                if (fs.existsSync(path.join(rootPath, file))) {
                    frameworks.add(framework);
                }
            }

        } catch (error) {
            Logger.warn('Failed to detect frameworks', error);
        }

        return Array.from(frameworks);
    }

    /**
     * Detect common patterns
     */
    private detectPatterns(files: FileInfo[]): string[] {
        const patterns: Set<string> = new Set();

        try {
            // Analyze file structure
            const hasTests = files.some(f => f.relativePath.includes('test') || f.relativePath.includes('spec'));
            if (hasTests) {
                patterns.add('Testing');
            }

            const hasDocs = files.some(f => f.relativePath.includes('doc') || f.relativePath.includes('README'));
            if (hasDocs) {
                patterns.add('Documentation');
            }

            const hasConfig = files.some(f => f.relativePath.includes('config') || f.relativePath.includes('.env'));
            if (hasConfig) {
                patterns.add('Configuration');
            }

            // Check for architectural patterns
            const hasComponents = files.some(f => f.relativePath.includes('component'));
            const hasServices = files.some(f => f.relativePath.includes('service'));
            const hasControllers = files.some(f => f.relativePath.includes('controller'));

            if (hasComponents && hasServices) {
                patterns.add('Component-Service Architecture');
            }

            if (hasControllers) {
                patterns.add('MVC Pattern');
            }

        } catch (error) {
            Logger.warn('Failed to detect patterns', error);
        }

        return Array.from(patterns);
    }

    /**
     * Get unique languages
     */
    private getLanguages(files: FileInfo[]): string[] {
        const languages = new Set(files.map(f => f.language).filter(l => l !== 'unknown'));
        return Array.from(languages);
    }

    /**
     * Calculate project metrics
     */
    private calculateMetrics(files: FileInfo[], dependencies: Record<string, string[]>): ProjectMetrics {
        const codeFiles = files.filter(f => f.language !== 'unknown' && !f.relativePath.includes('node_modules'));
        const testFiles = files.filter(f => f.relativePath.includes('test') || f.relativePath.includes('spec'));
        const configFiles = files.filter(f => ['json', 'yaml', 'xml'].includes(f.language));

        const totalLines = codeFiles.reduce((sum, f) => sum + (f.size / 25), 0); // Rough estimate
        const averageComplexity = codeFiles.reduce((sum, f) => sum + f.complexity, 0) / codeFiles.length;

        // Calculate maximum dependency depth
        const dependencyDepth = Math.max(...Object.values(dependencies).map(deps => deps.length));

        return {
            totalFiles: files.length,
            totalLines: Math.round(totalLines),
            codeFiles: codeFiles.length,
            testFiles: testFiles.length,
            configFiles: configFiles.length,
            averageComplexity: Math.round(averageComplexity * 100) / 100,
            dependencyDepth
        };
    }

    /**
     * Normalize file path for consistent comparison
     */
    private normalizePath(filePath: string): string {
        return filePath.replace(/\\/g, '/').toLowerCase();
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.projectStructure = undefined;
        this.isInitialized = false;
    }
}
