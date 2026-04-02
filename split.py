import os
import re

def split_script():
    with open('c:/Users/Lamartine/.gemini/antigravity/scratch/crm_pos_venda/script.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # We will just write the files manually because AST parsing in python for JS is complex.
    # Actually, let's just use Python to find the top level keys of the `app` object and their bounds.
    
    # Let's extract everything between `const app = {` and `}; window.app = app;`
    match = re.search(r'const app = \{(.*?)\n\};\n\nwindow\.app = app;', content, re.DOTALL)
    if not match:
        print("Could not find app object")
        return
        
    app_body = match.group(1)
    
    # It's better to just output the blocks and I will construct them.
    # Or just write simple JS directly.
    pass

if __name__ == '__main__':
    split_script()
