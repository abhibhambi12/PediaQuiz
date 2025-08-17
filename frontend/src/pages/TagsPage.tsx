import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTags } from '../services/firestoreService'; // Assuming firestoreService exports getTags

const TagsPage: React.FC = () => {
    // State to hold the list of tags
    const [tags, setTags] = useState<string[]>([]);

    // Effect to fetch tags when the component mounts
    useEffect(() => {
        getTags()
            .then(fetchedTags => {
                // Ensure fetchedTags is an array, default to empty if not
                setTags(Array.isArray(fetchedTags) ? fetchedTags : []);
            })
            .catch(error => {
                console.error("Error fetching tags:", error);
                setTags([]); // Ensure tags state is empty on error
            });
    }, []); // Empty dependency array means this effect runs only once on mount

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Tags</h1>
            {/* Display message if no tags are found */}
            {tags.length === 0 ? (
                <p>No tags available.</p>
            ) : (
                // List of tags, each linking to questions filtered by that tag
                <ul className="space-y-2">
                    {tags.map((tag) => (
                        <li key={tag} className="p-2 border-b border-gray-200 dark:border-gray-700">
                            <Link
                                to={`/tags/${tag}`} // Link to the route showing questions for this tag
                                className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                            >
                                {tag}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default TagsPage;