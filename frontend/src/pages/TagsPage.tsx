import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTags } from '../services/firestoreService';

const TagsPage: React.FC = () => {
    const [tags, setTags] = useState<string[]>([]);

    useEffect(() => {
        getTags().then(setTags).catch(console.error);
    }, []);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Tags</h1>
            <ul>
                {tags.map((tag) => (
                    <li key={tag} className="p-2 border-b">
                        <Link to={`/tags/${tag}`} className="text-blue-600 hover:underline">
                            {tag}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TagsPage;