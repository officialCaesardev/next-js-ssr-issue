'use client';

import { useEffect, useState } from 'react';

const Home = () => {
  const [data, setData] = useState('');
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:8080/');
        const res = await response.text();
        setData(res);
      } catch (error) {
        setData('There has been a problem with your fetch operation');
      }
    };
    fetchData();
  }, []);

  return (
    <>
      <div className="p-6">ok</div>
      <pre>{data}</pre>
    </>
  );
};

export default Home;
